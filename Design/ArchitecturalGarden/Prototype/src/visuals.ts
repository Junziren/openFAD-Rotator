import * as THREE from "three";

export type RenderStyle = "original" | "hologram" | "comic" | "cel";

const vertex = `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragment = `
uniform vec3 tint;
uniform float mode;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  float light = dot(n, normalize(vec3(-.5,.8,1.0))) * .5 + .5;
  vec3 color;
  float alpha = 1.0;
  if (mode < 1.5) {
    float rim = pow(1.0 - abs(n.z), 2.0);
    float scan = step(.70, fract(vWorld.y * 18.0));
    color = mix(vec3(.015,.12,.16), tint, .18) + rim * vec3(.03,.22,.26);
    // Unlit emissive contribution stays local to the holographic rim and scan bands.
    color += scan * .14 + pow(rim, 2.0) * vec3(.035,.12,.13);
    alpha = .52 + rim * .30 + scan * .10;
  } else if (mode < 2.5) {
    float shade = light > .72 ? 1.0 : light > .38 ? .74 : .45;
    float hatch = step(.82, fract((gl_FragCoord.x + gl_FragCoord.y) * .16));
    float dots = step(.73, sin(gl_FragCoord.x * .9) * sin(gl_FragCoord.y * .9));
    color = tint * shade;
    color *= 1.0 - hatch * step(light,.64) * .50 - dots * step(light,.4) * .18;
  } else {
    float shade = light > .78 ? 1.12 : light > .5 ? .87 : .46;
    color = tint * shade;
  }
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class VisualStyles {
  private originals = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private variants = new Map<THREE.Material, Map<RenderStyle, THREE.Material>>();
  private edges = new WeakMap<THREE.Mesh, THREE.LineSegments>();
  private edgeMaterial = new THREE.LineBasicMaterial({ color: "#26343a", transparent: true, opacity: .72 });
  style: RenderStyle = "original";

  apply(root: THREE.Object3D, style: RenderStyle) {
    this.style = style;
    const meshes: THREE.Mesh[] = [];
    root.traverse(node => { if (node instanceof THREE.Mesh && !node.userData.effect) meshes.push(node); });
    meshes.forEach(mesh => {
      if (!this.originals.has(mesh)) this.originals.set(mesh, mesh.material);
      const original = this.originals.get(mesh)!;
      const convert = (mat: THREE.Material) => {
        if (style === "original") return mat;
        if (!this.variants.has(mat)) this.variants.set(mat, new Map());
        const cache = this.variants.get(mat)!;
        if (!cache.has(style)) {
          const color = (mat as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color("#cbd8d2");
          if (style === "cel") color.offsetHSL(0, .16, -.03);
          const material = new THREE.ShaderMaterial({
            uniforms: { tint: { value: color }, mode: { value: { hologram: 1, comic: 2, cel: 3 }[style] } },
            vertexShader: vertex, fragmentShader: fragment,
            transparent: style === "hologram", depthWrite: style !== "hologram",
            side: THREE.FrontSide,
          });
          cache.set(style, material);
        }
        return cache.get(style)!;
      };
      mesh.material = Array.isArray(original) ? original.map(convert) : convert(original);
      mesh.castShadow = style === "original";
      if (style !== "original" && !this.edges.has(mesh)) {
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 32), this.edgeMaterial);
        edge.raycast = () => {};
        mesh.add(edge);
        this.edges.set(mesh, edge);
      }
      const edge = this.edges.get(mesh);
      if (edge) edge.visible = style !== "original";
    });
    this.edgeMaterial.color.set(style === "hologram" ? "#357e85" : "#26343a");
    this.edgeMaterial.opacity = style === "hologram" ? .65 : style === "comic" ? .8 : .4;
  }
  release(root: THREE.Object3D) {
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const edge = this.edges.get(node);
      if (edge) { edge.geometry.dispose(); node.remove(edge); }
    });
  }
}

export class RotorEffects {
  readonly root = new THREE.Group();
  private positions = new Float32Array(36 * 3);
  private trails = new Float32Array(36 * 6);
  private geometry = new THREE.BufferGeometry();
  private trailGeometry = new THREE.BufferGeometry();
  private rings: THREE.Mesh[] = [];
  private points: THREE.Points;
  private trailLines: THREE.LineSegments;
  private waves: THREE.Mesh[] = [];
  private feedback: THREE.Mesh;
  private feedbackAge = 1;
  private clock = 0;
  private center = new THREE.Vector3();
  enabled = true;
  strength = .65;
  mode: "combined" | "legacy" | "spatial" = "combined";

  constructor(scene: THREE.Scene) {
    const colors = new Float32Array(36 * 3);
    const trailColors = new Float32Array(36 * 6);
    const palette = ["#df876b", "#72b8b6", "#c4af5b"].map(c => new THREE.Color(c));
    for (let i = 0; i < 36; i++) {
      palette[i % 3].toArray(colors, i * 3);
      palette[i % 3].clone().multiplyScalar(.25).toArray(trailColors, i * 6);
      palette[i % 3].toArray(trailColors, i * 6 + 3);
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(this.geometry, new THREE.PointsMaterial({ size: .025, vertexColors: true, transparent: true, opacity: .3, depthWrite: false }));
    this.points = points;
    points.frustumCulled = false;
    this.root.add(points);
    this.trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trails, 3));
    this.trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
    const trails = new THREE.LineSegments(this.trailGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .48, depthWrite: false }));
    this.trailLines = trails;
    trails.frustumCulled = false;
    this.root.add(trails);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * .10, .009, 5, 64, Math.PI * .65),
        new THREE.MeshBasicMaterial({ color: palette[i], transparent: true, opacity: .55, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .04 + i * .025;
      this.rings.push(ring);
      this.root.add(ring);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * .10, .026, 5, 64, Math.PI * .65),
        new THREE.MeshBasicMaterial({ color: palette[i], transparent: true, opacity: .04, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.rotation.copy(ring.rotation);
      halo.position.copy(ring.position);
      halo.userData.halo = true;
      this.rings.push(halo);
      this.root.add(halo);
    }
    for (let i = 0; i < 3; i++) {
      const wave = new THREE.Mesh(new THREE.RingGeometry(1, 1.014, 96),
        new THREE.MeshBasicMaterial({ color: "#63958c", transparent: true, opacity: .15, depthWrite: false, side: THREE.DoubleSide }));
      wave.rotation.x = -Math.PI / 2;
      wave.position.y = .015;
      this.waves.push(wave);
      this.root.add(wave);
    }
    this.feedback = new THREE.Mesh(new THREE.RingGeometry(1, 1.025, 64),
      new THREE.MeshBasicMaterial({ color: "#ad8660", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.feedback.rotation.x = -Math.PI / 2;
    this.feedback.userData.effect = true;
    this.feedback.raycast = () => {};
    scene.add(this.feedback);
    this.root.traverse(node => { node.userData.effect = true; node.raycast = () => {}; });
    scene.add(this.root);
  }
  attach(cabinet: THREE.Object3D) {
    cabinet.getWorldPosition(this.center);
    this.root.position.copy(this.center);
  }
  pulse(building: THREE.Object3D) {
    building.getWorldPosition(this.feedback.position);
    this.feedback.position.y += .015;
    this.feedbackAge = 0;
  }
  update(dt: number, direction: number, doppler: number, motion: number) {
    this.root.visible = this.enabled && this.strength > 0;
    this.feedback.visible = this.root.visible && this.mode !== "legacy";
    if (!this.root.visible) return;
    this.clock += dt * direction * (.35 + motion);
    const legacy = this.mode !== "spatial";
    this.points.visible = this.trailLines.visible = legacy;
    (this.points.material as THREE.PointsMaterial).opacity = .38 * this.strength;
    (this.trailLines.material as THREE.LineBasicMaterial).opacity = .22 * this.strength;
    for (let i = 0; i < 36; i++) {
      const band = i % 3;
      const phase = i * 2.39996 + this.clock * (1 + band * .2);
      const radius = 1.12 + (i % 7) * .045;
      const y = .04 + band * .018;
      const x = Math.cos(phase) * radius, z = Math.sin(phase) * radius;
      this.positions.set([x, y, z], i * 3);
      const tail = .025 + doppler * .055 * this.strength;
      this.trails.set([Math.cos(phase - tail * direction) * radius, y, Math.sin(phase - tail * direction) * radius, x, y, z], i * 6);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.rings.forEach((ring, i) => {
      ring.visible = legacy;
      ring.rotation.z = this.clock * (Math.floor(i / 2) % 2 ? -1 : 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = this.strength * (ring.userData.halo ? .055 : .3);
    });
    this.waves.forEach((wave, i) => {
      wave.visible = this.mode !== "legacy";
      const age = ((Math.abs(this.clock) * .24 + i / 3) % 1);
      wave.scale.setScalar(1.1 + age * .8);
      (wave.material as THREE.MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * .25 * this.strength;
    });
    this.feedbackAge = Math.min(1, this.feedbackAge + dt * 1.8);
    this.feedback.scale.setScalar(.9 + this.feedbackAge * .45);
    (this.feedback.material as THREE.MeshBasicMaterial).opacity = (1 - this.feedbackAge) * .45 * this.strength;
  }
}
