#!/usr/bin/env bash
# Assemble the macOS desktop app with its owned server and the ONNX runtime.
set -euo pipefail

die() { printf '%s\n' "$*" >&2; exit 1; }
repo=$(cd "$(dirname "$0")/.." && pwd -P)
arch=$(uname -m)
case "$arch" in arm64) nuget_arch=arm64 ;; x86_64) nuget_arch=x64 ;; *) die "Unsupported architecture: $arch" ;; esac
[[ $(uname -s) == Darwin ]] || die 'This packager must run on macOS.'

check_bundle() {
    local app=$1 binary
    for binary in MacOS/mindvault-desktop MacOS/mv Frameworks/libonnxruntime.dylib; do
        [[ -f $app/Contents/$binary ]] || die "Bundle missing Contents/$binary"
        lipo -verify_arch "$arch" "$app/Contents/$binary" || die "Wrong architecture: $binary"
    done
    [[ -s $app/Contents/Resources/onnxruntime/LICENSE ]] || die 'Missing ONNX Runtime license'
    [[ -s $app/Contents/Resources/onnxruntime/ThirdPartyNotices.txt ]] || die 'Missing ONNX Runtime notices'
    codesign --verify --deep --strict "$app"
}

if [[ ${1:-} == --check ]]; then
    [[ $# == 2 ]] || die "Usage: $0 --check /path/to/Tivity.app"
    check_bundle "$2"
    exit
fi

desktop_target=${TIVITY_DESKTOP_TARGET_DIR:-$repo/frontend/src-tauri/target}
server_target=${TIVITY_SERVER_TARGET_DIR:-$repo/target}
[[ $desktop_target == /* && $server_target == /* ]] || die 'Use absolute target directory paths.'
server_bin=${TIVITY_SERVER_BIN:-$server_target/release/mv}
[[ $server_bin == /* ]] || die 'Use an absolute server binary path.'
case ${1:-} in
    '')
        if [[ -z ${TIVITY_SERVER_BIN:-} ]]; then
            CARGO_TARGET_DIR=$server_target cargo build --manifest-path "$repo/Cargo.toml" --locked --release -p mv-cli --bin mv
        fi
        CARGO_TARGET_DIR=$desktop_target pnpm --dir "$repo/frontend" exec tauri build --no-bundle -- --locked
        ;;
    --assemble) [[ $# == 1 ]] || die "Usage: $0 [--assemble]" ;;
    *) die "Usage: $0 [--assemble | --check /path/to/Tivity.app]" ;;
esac
[[ -x $server_bin ]] || die "Missing server executable: $server_bin"
lipo -verify_arch "$arch" "$server_bin" || die 'Server does not match the desktop architecture.'

# Microsoft redistributes the same runtime and matching notices in this archive.
# Keep this version compatible with the API version pinned by ort-sys in Cargo.lock.
version=1.23.2
sha256=25fe172f7fcdf34f2b5b02c8b997f6b88abc282956849d4af4335af23d0c4e4a
package=microsoft.ml.onnxruntime.$version.nupkg
cache=$desktop_target/onnx
mkdir -p "$cache"
archive=$cache/$package
checksum() { printf '%s  %s\n' "$sha256" "$1" | shasum -a 256 -c --status; }
if ! [[ -f $archive ]]; then
    download=$(mktemp "$cache/download.XXXXXXXX")
    trap 'rm -f "$download"' EXIT
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 2 --max-time 180 \
        "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/$version/$package" -o "$download"
    checksum "$download" || die 'Downloaded ONNX Runtime failed SHA-256 verification.'
    mv "$download" "$archive"
    trap - EXIT
fi
checksum "$archive" || die "ONNX Runtime checksum failed: $archive"
CARGO_TARGET_DIR=$desktop_target pnpm --dir "$repo/frontend" exec tauri bundle --bundles app --no-sign --ci

app=$desktop_target/release/bundle/macos/Tivity.app
contents=$app/Contents
[[ -x $contents/MacOS/mindvault-desktop ]] || die "Tauri app missing at $app"
mkdir -p "$contents/Frameworks" "$contents/Resources/onnxruntime"
install -m 755 "$server_bin" "$contents/MacOS/mv"
unzip -p "$archive" "runtimes/osx-$nuget_arch/native/libonnxruntime.dylib" > "$contents/Frameworks/libonnxruntime.dylib"
for notice in LICENSE ThirdPartyNotices.txt; do
    unzip -p "$archive" "$notice" > "$contents/Resources/onnxruntime/$notice"
done

# Sign nested Mach-O files before signing the app. `-` is local ad-hoc signing.
identity=${TIVITY_CODESIGN_IDENTITY:--}
sign_options=(--force --sign "$identity")
if [[ $identity != '-' ]]; then sign_options+=(--options runtime --timestamp); fi
codesign "${sign_options[@]}" "$contents/Frameworks/libonnxruntime.dylib"
codesign "${sign_options[@]}" "$contents/MacOS/mv"
codesign "${sign_options[@]}" "$app"
check_bundle "$app"
printf 'Verified macOS bundle: %s\n' "$app"
