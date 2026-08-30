#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE=""
for candidate in "$SCRIPT_DIR/Installer"/*.pkg; do
    if [ -f "$candidate" ]; then
        PACKAGE="$candidate"
        break
    fi
done

if [ -z "$PACKAGE" ]; then
    printf 'No macOS installer package was found beside this command file.\n' >&2
    exit 1
fi

open "$PACKAGE"
