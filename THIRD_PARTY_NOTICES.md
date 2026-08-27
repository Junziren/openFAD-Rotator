# Third-party notices

This project embeds or builds against the following third-party components.

- JUCE: https://juce.com/ and the license text shipped with the selected JUCE checkout.
- gl-matrix: matrix and vector operations for the native WebGL2 renderer; its license is retained in the pinned npm package.
- React, React DOM, Vite, TypeScript and lucide-react: licenses are retained in `WebUI/node_modules` during development and must be copied into the release notices bundle.
- Source Sans 3, Noto Sans SC and JetBrains Mono: open font packages used by the offline WebUI; their license files are included in the npm packages.
- Microsoft WebView2 SDK/runtime: `Resources/WebView2/WebView2Loader.dll` is an x64 loader redistributed under Microsoft's WebView2 terms; the target machine still needs the Evergreen Runtime.
- SADIE II HRTF data: reserved for the Studio binaural asset pass; the selected file and its attribution must be copied into `Resources/HRTF/` before shipping.

No commercial speaker brand, model name, logo, or proprietary measurement is included in the current source tree.
