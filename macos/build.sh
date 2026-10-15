#!/bin/zsh
# Builds Aircon, installs it in /Applications (or ~/Applications) and opens it.
#
#   ./build.sh            generate the Xcode project, build (Release), install and open
#   ./build.sh --no-open  the same without opening the app
#   ./build.sh test       run the unit tests
#
# Needs Xcode 27, XcodeGen (brew install xcodegen) and an "Apple Development" certificate: sign in to Xcode with your
# Apple ID once (Xcode > Settings > Accounts); a free Personal Team is enough.
set -euo pipefail
cd "${0:A:h}"

lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

if [[ ! -f Config/Local.xcconfig ]]; then
  # The team ID is the OU of the Apple Development certificate Xcode created when you signed in.
  teams=(${(u)${(f)"$(security find-certificate -a -c "Apple Development" -p 2>/dev/null \
    | openssl crl2pkcs7 -nocrl -certfile /dev/stdin 2>/dev/null | openssl pkcs7 -print_certs -noout 2>/dev/null \
    | grep -oE 'OU ?= ?[A-Z0-9]{10}' | grep -oE '[A-Z0-9]{10}$')"}})
  if (( ${#teams} != 1 )); then
    print -u2 "Couldn't pick your Apple Developer team (found: ${teams:-none})."
    print -u2 "Sign in to Xcode with your Apple ID (Xcode > Settings > Accounts), or copy Config/Local.xcconfig.example"
    print -u2 "to Config/Local.xcconfig and enter your team ID."
    exit 1
  fi
  print "DEVELOPMENT_TEAM = ${teams[1]}" > Config/Local.xcconfig
  print "Signing with team ${teams[1]} (saved in Config/Local.xcconfig)."
fi

xcodegen generate --quiet

if [[ "${1:-}" == test ]]; then
  exec xcodebuild test -project Aircon.xcodeproj -scheme Aircon -destination 'platform=macOS' \
    -derivedDataPath build/DerivedData -quiet
fi

xcodebuild build -project Aircon.xcodeproj -scheme Aircon -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath build/DerivedData -quiet
built="build/DerivedData/Build/Products/Release/Aircon.app"

destination=/Applications
[[ -w $destination ]] || { destination=~/Applications; mkdir -p $destination; }
installed="$destination/Aircon.app"

if pgrep -xq "Aircon"; then
  osascript -e 'quit app "Aircon"' >/dev/null 2>&1 || true
  sleep 1
fi
rm -rf "$installed"
ditto "$built" "$installed"
$lsregister -u "$built" >/dev/null 2>&1 || true
$lsregister -f "$installed"
print "Installed $installed"

if [[ "${1:-}" != --no-open ]]; then
  open "$installed"
fi
