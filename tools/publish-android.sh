#!/usr/bin/env bash
# Publishes one Play-signed KanaPop APK to android.html.
#
#   tools/publish-android.sh ~/Downloads/<the universal APK>.apk [YYYY-MM-DD]
#
# The date is when that version came out, and defaults to today; pass it when
# publishing an older version after a newer one. The page lists versions by
# versionCode, newest first, whatever order they were published in.
#
# The APK is the one Google Play signs: Play Console → the app → App bundle
# explorer → the version → Downloads → "Signed, universal APK". Not one built
# locally from the AAB: that is signed with the upload key, and a copy signed
# with it cannot update, or be updated by, the copy Play installs without an
# uninstall that wipes the player's progress. The script refuses one.
#
# It creates the GitHub release android-v<versionName> with the APK as
# KanaPop-<versionName>.apk, prepends the version to android/releases.json,
# and commits and pushes that, which republishes the page.
set -euo pipefail

REPO=wz333/kanapop-support
PACKAGE=com.wz333.kanapop
# The upload key's certificate (~/dev/keys/kanapop-upload.*). An APK carrying
# it was not signed by Play.
UPLOAD_CERT=2B:4F:0B:8A:0A:16:05:84:01:98:A2:22:68:CF:4C:31:7B:D7:EC:F0:C9:F2:56:C6:76:1E:F8:EF:23:98:0E:21

apk=${1:?usage: tools/publish-android.sh path/to/universal.apk [YYYY-MM-DD]}
date=${2:-$(date +%F)}
[[ $date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "date must be YYYY-MM-DD: $date" >&2; exit 1; }
[[ -f $apk ]] || { echo "no such file: $apk" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
data=$root/android/releases.json
tools=$(ls -d "$HOME"/Library/Android/sdk/build-tools/* | sort -V | tail -1)
[[ -x $tools/aapt2 && -x $tools/apksigner ]] || { echo "no aapt2/apksigner under $tools" >&2; exit 1; }

badging=$("$tools/aapt2" dump badging "$apk")
pkg=$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" <<<"$badging")
version_code=$(sed -n "s/.* versionCode='\([0-9]*\)'.*/\1/p" <<<"$badging")
version_name=$(sed -n "s/.* versionName='\([^']*\)'.*/\1/p" <<<"$badging")
[[ $pkg == "$PACKAGE" ]] || { echo "package is $pkg, expected $PACKAGE" >&2; exit 1; }

cert=$("$tools/apksigner" verify --print-certs "$apk" \
  | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1 \
  | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//')
[[ -n $cert ]] || { echo "could not read the APK's signer" >&2; exit 1; }
if [[ $cert == "$UPLOAD_CERT" ]]; then
  echo "This APK is signed with the upload key, not by Google Play. Download the" >&2
  echo "signed universal APK from Play Console's App bundle explorer instead." >&2
  exit 1
fi

known=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["signingCertSha256"] or "")' "$data")
if [[ -z $known ]]; then
  echo "First publish: every later APK must carry this signing certificate."
  echo "  $cert"
  echo "Check it matches Play Console → Test and release → App integrity →"
  echo "App signing key certificate → SHA-256."
  read -r -p "Does it match? [y/N] " ok
  [[ $ok == y || $ok == Y ]] || exit 1
elif [[ $cert != "$known" ]]; then
  echo "Signed by $cert, but earlier versions were signed by $known." >&2
  exit 1
fi

if python3 -c 'import json,sys; sys.exit(0 if any(r["versionCode"]==int(sys.argv[2]) for r in json.load(open(sys.argv[1]))["releases"]) else 1)' "$data" "$version_code"; then
  echo "versionCode $version_code is already on the page" >&2
  exit 1
fi

tag=android-v$version_name
asset=KanaPop-$version_name.apk
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$apk" "$tmp/$asset"
sha=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
size=$(stat -f %z "$tmp/$asset")
url=https://github.com/$REPO/releases/download/$tag/$asset
# An older version published late must not become GitHub's "Latest" release.
newest=$(python3 -c 'import json,sys; print(max([r["versionCode"] for r in json.load(open(sys.argv[1]))["releases"]] or [0]))' "$data")
latest_flag=--latest
(( version_code > newest )) || latest_flag=--latest=false

echo "Publishing KanaPop $version_name ($version_code) for Android, $size bytes"
gh release create "$tag" "$tmp/$asset" --repo "$REPO" "$latest_flag" \
  --title "KanaPop $version_name for Android" \
  --notes "Signed universal APK from Google Play. versionCode $version_code.

SHA-256: \`$sha\`"

python3 - "$data" "$cert" "$version_name" "$version_code" "$size" "$sha" "$url" "$date" <<'EOF'
import json, sys
path, cert, name, code, size, sha, url, date = sys.argv[1:]
data = json.load(open(path))
data["signingCertSha256"] = cert
data["releases"].append({
    "versionName": name, "versionCode": int(code), "date": date,
    "sizeBytes": int(size), "sha256": sha, "url": url,
})
data["releases"].sort(key=lambda r: r["versionCode"], reverse=True)
with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
EOF

git -C "$root" add android/releases.json
git -C "$root" commit -q -m "Android $version_name ($version_code) APK"
git -C "$root" push -q
echo "Done: https://wz333.app/kanapop-support/android.html"
