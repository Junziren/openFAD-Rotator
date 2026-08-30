# macOS release

The macOS distribution is built on the hosted Apple runner with JUCE 8.0.12
and contains universal2 binaries for arm64 and x86_64.

## Artifacts

- `openFAD-Rotator-<version>-macOS-universal2.pkg` installs the VST3 bundle to
  `/Library/Audio/Plug-Ins/VST3/` and the Standalone app to `/Applications/`.
- `openFAD-Rotator-<version>-macOS-universal2.zip` contains the package, the
  same plugin bundles, documentation, and install/uninstall command files.

The AUv3 extension is embedded in the Standalone app under
`Contents/PlugIns/`. It is not copied as a loose extension into a system
directory.

macOS provides the WebKit, CoreAudio, and related system frameworks used by the
plugin, so this distribution has no Node, Python, WebView2, or VC++ runtime
payload. The package and binaries are currently unsigned for development
distribution; signing, notarization, clean-machine installation, and Logic Pro
validation remain release gates.

## Local packaging

After a successful macOS Release build:

```bash
bash Scripts/package-macos-release.sh \
  --build-dir build-macos \
  --configuration Release
```

The output is written to `build-macos/macos-release/` unless `--output-dir` is
provided.

## GitHub release

`.github/workflows/macos-release.yml` runs the same build and packaging steps.
Pushing a tag such as `v0.1.1` builds the two macOS assets and publishes them to
the matching GitHub Release. Manual runs build an artifact without publishing
unless they are started from a version tag with the publish option enabled.
