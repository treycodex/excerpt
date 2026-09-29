#!/bin/bash
# Creates a local, self-signed code-signing identity so TCC permissions survive
# rebuilds. Not an Apple certificate: it does nothing for Gatekeeper or
# distribution. It exists purely to stop macOS treating every build as a new app
# and re-prompting for microphone, screen recording and speech every single time.
#
# Remove it later from Keychain Access by deleting "Excerpt Dev Local".
set -euo pipefail
NAME="Excerpt Dev Local"
if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "'$NAME' already exists. Check its Keychain Access permissions before a release:"
  echo "an identity previously imported with -A may still allow every app to use its key."
  exit 0
fi
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

openssl req -x509 -newkey rsa:2048 -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -days 3650 -nodes -subj "/CN=$NAME" \
  -addext "extendedKeyUsage=codeSigning" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature"

# -legacy: OpenSSL 3 writes a PKCS#12 MAC that macOS Security rejects.
openssl pkcs12 -export -legacy -out "$DIR/identity.p12" \
  -inkey "$DIR/key.pem" -in "$DIR/cert.pem" -passout pass:excerptdev -name "$NAME"

# Only codesign may use this identity without a Keychain prompt. Do not add -A:
# it grants every local application access and is not repaired by rerunning import.
security import "$DIR/identity.p12" -k ~/Library/Keychains/login.keychain-db \
  -P excerptdev -T /usr/bin/codesign
security add-trusted-cert -r trustRoot -p codeSign \
  -k ~/Library/Keychains/login.keychain-db "$DIR/cert.pem"

security find-identity -v -p codesigning | grep "$NAME"
