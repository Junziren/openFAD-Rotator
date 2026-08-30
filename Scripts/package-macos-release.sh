#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build-macos"
CONFIGURATION="Release"
OUTPUT_DIRECTORY=""
PRODUCT_VERSION=""

usage() {
    cat <<'EOF'
Usage: package-macos-release.sh [options]

Options:
  --build-dir PATH       macOS CMake build directory
  --configuration NAME   CMake configuration (default: Release)
  --output-dir PATH      output directory for .pkg and .zip
  --version VERSION      product version (default: CMake project version)
  -h, --help             show this help
EOF
}

die() {
    printf 'error: %s\n' "$1" >&2
    exit 1
}

resolve_path() {
    case "$1" in
        /*) printf '%s\n' "$1" ;;
        *) printf '%s/%s\n' "$ROOT" "$1" ;;
    esac
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --build-dir)
            [ "$#" -ge 2 ] || die "--build-dir requires a value"
            BUILD_DIR="$2"
            shift 2
            ;;
        --configuration)
            [ "$#" -ge 2 ] || die "--configuration requires a value"
            CONFIGURATION="$2"
            shift 2
            ;;
        --output-dir)
            [ "$#" -ge 2 ] || die "--output-dir requires a value"
            OUTPUT_DIRECTORY="$2"
            shift 2
            ;;
        --version)
            [ "$#" -ge 2 ] || die "--version requires a value"
            PRODUCT_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "unknown argument: $1"
            ;;
    esac
done

BUILD_DIR="$(resolve_path "$BUILD_DIR")"
[ -d "$BUILD_DIR" ] || die "build directory not found: $BUILD_DIR"

if [ -z "$PRODUCT_VERSION" ]; then
    PRODUCT_VERSION="$(sed -nE 's/.*project[[:space:]]*\([[:space:]]*openFADRotator[[:space:]]+VERSION[[:space:]]+([0-9]+(\.[0-9]+){1,3}).*/\1/p' "$ROOT/CMakeLists.txt" | head -n 1)"
fi
[ -n "$PRODUCT_VERSION" ] || die "could not determine product version"
case "$PRODUCT_VERSION" in
    *[!0-9.]*|*..*|.*|*.) die "version must contain only numeric dot-separated components: $PRODUCT_VERSION" ;;
esac

if [ -z "$OUTPUT_DIRECTORY" ]; then
    OUTPUT_DIRECTORY="$BUILD_DIR/macos-release"
else
    OUTPUT_DIRECTORY="$(resolve_path "$OUTPUT_DIRECTORY")"
fi
mkdir -p "$OUTPUT_DIRECTORY"

ARTEFACT_ROOT="$BUILD_DIR/openFADRotator_artefacts/$CONFIGURATION"
VST3_SOURCE="$ARTEFACT_ROOT/VST3/openFAD Rotator.vst3"
AU_SOURCE="$ARTEFACT_ROOT/AUv3/openFAD Rotator.appex"
STANDALONE_ROOT="$ARTEFACT_ROOT/Standalone"

[ -d "$VST3_SOURCE" ] || die "VST3 bundle not found: $VST3_SOURCE"
[ -d "$AU_SOURCE" ] || die "AUv3 extension not found: $AU_SOURCE"
[ -d "$STANDALONE_ROOT" ] || die "Standalone output directory not found: $STANDALONE_ROOT"

STANDALONE_SOURCE=""
for candidate in "$STANDALONE_ROOT"/*.app; do
    if [ -d "$candidate" ]; then
        STANDALONE_SOURCE="$candidate"
        break
    fi
done
[ -n "$STANDALONE_SOURCE" ] || die "Standalone .app bundle not found under $STANDALONE_ROOT"

EMBEDDED_AU=""
for candidate in "$STANDALONE_SOURCE/Contents/PlugIns"/*.appex; do
    if [ -d "$candidate" ]; then
        EMBEDDED_AU="$candidate"
        break
    fi
done
[ -n "$EMBEDDED_AU" ] || die "Standalone app does not contain an embedded AUv3 extension"

VST3_BINARY="$VST3_SOURCE/Contents/MacOS/openFAD Rotator"
if [ ! -x "$VST3_BINARY" ]; then
    VST3_BINARY="$(find "$VST3_SOURCE/Contents" -type f -perm -111 -print -quit)"
fi
[ -n "$VST3_BINARY" ] && [ -x "$VST3_BINARY" ] || die "VST3 executable was not found"

STANDALONE_BINARY="$STANDALONE_SOURCE/Contents/MacOS/openFAD Rotator"
[ -x "$STANDALONE_BINARY" ] || die "Standalone executable was not found: $STANDALONE_BINARY"

AU_BINARY="$EMBEDDED_AU/Contents/MacOS/$(basename "$STANDALONE_BINARY")"
if [ ! -x "$AU_BINARY" ]; then
    AU_BINARY="$(find "$EMBEDDED_AU/Contents" -type f -perm -111 -print -quit)"
fi
[ -n "$AU_BINARY" ] && [ -x "$AU_BINARY" ] || die "embedded AUv3 executable was not found"

assert_universal2() {
    local label="$1"
    local binary="$2"
    local architectures
    architectures="$(lipo -archs "$binary")"
    case " $architectures " in
        *" arm64 "*) ;;
        *) die "$label is missing arm64: $architectures" ;;
    esac
    case " $architectures " in
        *" x86_64 "*) ;;
        *) die "$label is missing x86_64: $architectures" ;;
    esac
    printf '%s: %s (%s)\n' "$label" "$binary" "$architectures"
}

command -v pkgbuild >/dev/null 2>&1 || die "pkgbuild is required on macOS"
command -v ditto >/dev/null 2>&1 || die "ditto is required on macOS"
command -v lipo >/dev/null 2>&1 || die "lipo is required on macOS"

assert_universal2 "VST3" "$VST3_BINARY"
assert_universal2 "Standalone" "$STANDALONE_BINARY"
assert_universal2 "AUv3" "$AU_BINARY"

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/openfad-macos-release.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT

PAYLOAD="$TEMP_ROOT/payload"
PKG_SCRIPTS="$TEMP_ROOT/pkg-scripts"
mkdir -p "$PAYLOAD/Applications" \
         "$PAYLOAD/Library/Audio/Plug-Ins/VST3" \
         "$PKG_SCRIPTS"

ditto "$VST3_SOURCE" "$PAYLOAD/Library/Audio/Plug-Ins/VST3/openFAD Rotator.vst3"
ditto "$STANDALONE_SOURCE" "$PAYLOAD/Applications/$(basename "$STANDALONE_SOURCE")"

cat > "$PKG_SCRIPTS/preinstall" <<'EOF'
#!/bin/sh
set -eu

# Remove only this product's previous bundles so stale WebUI resources cannot survive an upgrade.
rm -rf "/Library/Audio/Plug-Ins/VST3/openFAD Rotator.vst3"
rm -rf "/Applications/openFAD Rotator.app"
EOF
chmod 755 "$PKG_SCRIPTS/preinstall"

PKG_NAME="openFAD-Rotator-${PRODUCT_VERSION}-macOS-universal2.pkg"
PKG_PATH="$OUTPUT_DIRECTORY/$PKG_NAME"
rm -f "$PKG_PATH"
pkgbuild \
    --root "$PAYLOAD" \
    --scripts "$PKG_SCRIPTS" \
    --identifier "org.unpurebloom.openfad.rotator.pkg" \
    --version "$PRODUCT_VERSION" \
    --install-location / \
    "$PKG_PATH"

STAGE="$TEMP_ROOT/openFAD-Rotator-${PRODUCT_VERSION}-macOS-universal2"
mkdir -p "$STAGE/VST3" "$STAGE/Standalone" "$STAGE/AUv3" "$STAGE/Installer" "$STAGE/Docs"
ditto "$VST3_SOURCE" "$STAGE/VST3/openFAD Rotator.vst3"
ditto "$STANDALONE_SOURCE" "$STAGE/Standalone/$(basename "$STANDALONE_SOURCE")"
ditto "$PKG_PATH" "$STAGE/Installer/$PKG_NAME"

cp "$ROOT/README.md" "$STAGE/README.md"
cp "$ROOT/LICENSE" "$STAGE/LICENSE"
cp "$ROOT/THIRD_PARTY_NOTICES.md" "$STAGE/THIRD_PARTY_NOTICES.md"
for document in BUILD.md VALIDATION.md IMPLEMENTATION_STATUS.md MACOS_RELEASE.md; do
    cp "$ROOT/Docs/$document" "$STAGE/Docs/$document"
done
cp "$ROOT/Scripts/install-macos-release.command" "$STAGE/Install-openFAD-Rotator.command"
cp "$ROOT/Scripts/uninstall-macos-release.command" "$STAGE/Uninstall-openFAD-Rotator.command"
chmod 755 "$STAGE/Install-openFAD-Rotator.command" "$STAGE/Uninstall-openFAD-Rotator.command"

cat > "$STAGE/AUv3/README.md" <<EOF
# AUv3 payload

The AUv3 extension is embedded in the Standalone app at:
\`Standalone/$(basename "$STANDALONE_SOURCE")/Contents/PlugIns/$(basename "$EMBEDDED_AU")\`

The installer places that containing app in /Applications. A signed and
notarized Apple distribution remains a separate release gate.
EOF

cat > "$STAGE/package-metadata.json" <<EOF
{
  "schemaVersion": 1,
  "product": "openFAD Rotator",
  "publisher": "Unpure Bloom",
  "version": "$PRODUCT_VERSION",
  "platform": "macOS",
  "architectures": ["arm64", "x86_64"],
  "minimumOS": "12.0",
  "packageType": "pkg-and-portable-zip",
  "signed": false,
  "notarized": false,
  "includes": ["VST3", "Standalone", "AUv3 embedded in Standalone", "Installer", "Docs", "LICENSE", "THIRD_PARTY_NOTICES.md"],
  "runtimeDependencies": [],
  "systemInstallLocations": {
    "vst3": "/Library/Audio/Plug-Ins/VST3/openFAD Rotator.vst3",
    "standalone": "/Applications/openFAD Rotator.app"
  },
  "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF

ZIP_NAME="openFAD-Rotator-${PRODUCT_VERSION}-macOS-universal2.zip"
ZIP_PATH="$OUTPUT_DIRECTORY/$ZIP_NAME"
rm -f "$ZIP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$STAGE" "$ZIP_PATH"

printf 'macOS package: %s\n' "$PKG_PATH"
printf 'macOS portable distribution: %s\n' "$ZIP_PATH"
