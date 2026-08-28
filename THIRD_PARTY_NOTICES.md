# Third-party notices

This project embeds or builds against the following third-party components.

- JUCE: https://juce.com/ and the license text shipped with the selected JUCE checkout.
- VST3 SDK: the Steinberg SDK shipped inside the selected JUCE checkout and its accompanying license text.
- gl-matrix: matrix and vector operations for the native WebGL2 renderer.
- React, React DOM, scheduler and lucide-react: runtime UI libraries bundled into the WebUI.
- Source Sans 3, Noto Sans SC and JetBrains Mono: open font packages used by the offline WebUI.
- Microsoft WebView2 SDK/runtime: `Resources/WebView2/WebView2Loader.dll` is an x64 loader redistributed under Microsoft's WebView2 terms. The Windows offline release also bundles the official Evergreen Standalone x64 Runtime; source-built copies still require a compatible WebView2 Runtime on the target machine.
- SADIE II HRTF data: reserved for the Studio binaural asset pass; the selected file and its attribution must be copied into `Resources/HRTF/` before shipping.

The Windows release packaging script copies the applicable JUCE, VST3 SDK and
WebUI runtime license texts into `THIRD_PARTY_LICENSES/` and writes a hashed
`THIRD_PARTY_LICENSES/manifest.json`. The package installer verifies that
manifest before installing. Build tools such as Vite and TypeScript are not
redistributed in the plugin bundle; their development licenses remain in the
source dependency lockfile.

No commercial speaker brand, model name, logo, or proprietary measurement is included in the current source tree.
