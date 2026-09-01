#!/bin/bash

set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-hours-tracker-505617}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The script may live in the project root or directly inside its firebase folder.
if [[ -f "$SCRIPT_DIR/firebase/firebase.json" ]]; then
  FIREBASE_DIR="$SCRIPT_DIR/firebase"
elif [[ -f "$SCRIPT_DIR/firebase.json" ]]; then
  FIREBASE_DIR="$SCRIPT_DIR"
else
  echo "Could not find firebase/firebase.json or firebase.json next to this script."
  exit 1
fi

if [[ ! -f "$FIREBASE_DIR/firestore.rules" ]]; then
  echo "Missing $FIREBASE_DIR/firestore.rules"
  exit 1
fi

if [[ ! -f "$FIREBASE_DIR/firebase-dist/index.html" ]]; then
  echo "Missing $FIREBASE_DIR/firebase-dist/index.html"
  echo "Build or copy the Firebase website files before deploying."
  exit 1
fi

VERSION_FILE="$SCRIPT_DIR/.release-version"
if [[ ! -f "$VERSION_FILE" ]]; then
  echo "Missing $VERSION_FILE"
  exit 1
fi

CURRENT_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
IFS='.' read -r VERSION_MAJOR VERSION_MINOR VERSION_PATCH <<< "$CURRENT_VERSION"
if [[ ! "$VERSION_MAJOR" =~ ^[0-9]+$ || ! "$VERSION_MINOR" =~ ^[0-9]+$ || ! "$VERSION_PATCH" =~ ^[0-9]+$ ]]; then
  echo "Invalid release version: $CURRENT_VERSION"
  exit 1
fi

RELEASE_VERSION="$VERSION_MAJOR.$VERSION_MINOR.$((VERSION_PATCH + 1))"
INDEX_FILE="$FIREBASE_DIR/firebase-dist/index.html"
perl -0pi -e "s#(index-tT16tZ1S\\.js)\\?v=[^\"]+#\\1?v=$RELEASE_VERSION#g; s#(index-B3A5AJiX\\.css)\\?v=[^\"]+#\\1?v=$RELEASE_VERSION#g; s#<body[^>]*>#<body data-app-version=\"$RELEASE_VERSION\">#g; s#(<div class=\"app-version\" aria-label=\"App version\">)[^<]*(</div>)#\\1Version $RELEASE_VERSION\\2#g" "$INDEX_FILE"

if command -v firebase >/dev/null 2>&1; then
  FIREBASE=(firebase)
elif command -v npx >/dev/null 2>&1; then
  FIREBASE=(npx --yes firebase-tools)
else
  echo "Firebase CLI is unavailable. Install Node.js, then run this script again."
  exit 1
fi

echo "Deploying FADAP Hours version $RELEASE_VERSION to Firebase project: $PROJECT_ID"
cd "$FIREBASE_DIR"

"${FIREBASE[@]}" deploy \
  --project "$PROJECT_ID" \
  --only firestore:rules,hosting,functions

printf '%s\n' "$RELEASE_VERSION" > "$VERSION_FILE"

echo
echo "Deployment complete: https://${PROJECT_ID}.web.app/"
echo "Released version: $RELEASE_VERSION"
