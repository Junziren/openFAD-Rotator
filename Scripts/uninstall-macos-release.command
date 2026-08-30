#!/usr/bin/env bash
set -euo pipefail

printf 'Removing only openFAD Rotator system bundles.\n'
sudo rm -rf \
    "/Library/Audio/Plug-Ins/VST3/openFAD Rotator.vst3" \
    "/Applications/openFAD Rotator.app"
printf 'openFAD Rotator uninstall complete.\n'
