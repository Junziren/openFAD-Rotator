# Acoustic Garden release - 2026-09-20

## Downloads

- Windows x64: use `openFAD-Rotator-0.1.0-Windows-x64-Offline-Setup.exe`.
  It includes the VST3 bundle, Standalone application, WebView2 Evergreen
  standalone/offline x64 installer, VC++ x64 14.51.36247 runtime installer,
  WebView2Loader, embedded fonts/model/UI and third-party licenses.
  No Node, Python, manual DLL copying or separate runtime downloads are needed.
- macOS 12+: use `openFAD-Rotator-0.1.0-macOS-universal2.pkg`, or the ZIP for
  the complete portable distribution. Intel and Apple Silicon are included.
  The AUv3 extension is embedded in the Standalone application.

Windows Setup installs the plugin in the standard system VST3 directory,
creates a Start Menu shortcut and registers an uninstaller. It checks runtime
versions before copying the product, installs missing dependencies silently,
reports dependency failures and honors reboot requests. Existing newer runtimes
are retained. User presets and shared runtimes are not removed by uninstall.
Close the DAW before installation and reopen it afterwards for plugin discovery.
Host-specific rescans and audio-device selection may still be necessary.

The plugin product version remains 0.1.0; this dated release distinguishes the
Acoustic Garden update from the original v0.1.0 distribution.
Both platform binaries are from source commit
`b7bb33b81d7da1f4fc4935d1c9532e2f70a8e434`; subsequent packaging changes do not
alter the plugin binary.

## Validation and limitations

- Windows final EXE installation completed with exit code 0, without reboot.
- Installed VST3 host smoke, state reload and offline export passed.
- Installed native UI passed GLB, 40-parameter, gesture, preset, four-style,
  About and telemetry tests.
- Package audit passed; both dependency installers have valid Microsoft signatures.
- macOS Actions build and packaging succeeded; eight CTest checks passed and
  universal2 bundle architecture/topology checks passed.
- No clean disconnected Windows VM test was available. The tested Windows
  machine already had the required runtimes; missing-runtime branches still
  require clean-machine acceptance.
- The Windows Setup and plugin are unsigned. Windows may display an unknown
  publisher or SmartScreen warning. The macOS build is unsigned and not notarized.
  These are not security-prompt-free production installers.
- Target DAW workflows and Mac GUI/device behavior require real-machine testing.

## Rebuild Windows Setup

Use Inno Setup 6.7.3 with the repository's Release build and WebUI dependencies.
Place official signed runtime installers under `build-vs/installer-deps`:
`MicrosoftEdgeWebView2RuntimeInstallerX64.exe` and `VC_redist.current.x64.exe`.
The VC runtime must be at least 14.51.36247.0.
Run `Scripts/package-windows-setup.ps1 -Compiler <path-to-ISCC.exe>`.
The script stages the canonical build, validates Microsoft signatures and writes
the EXE and a separate SHA-256 file under `build-vs/garden-release`.
