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

if command -v firebase >/dev/null 2>&1; then
  FIREBASE=(firebase)
elif command -v npx >/dev/null 2>&1; then
  FIREBASE=(npx --yes firebase-tools)
else
  echo "Firebase CLI is unavailable. Install Node.js, then run this script again."
  exit 1
fi

echo "Deploying FADAP Hours to Firebase project: $PROJECT_ID"
cd "$FIREBASE_DIR"

"${FIREBASE[@]}" deploy \
  --project "$PROJECT_ID" \
  --only firestore:rules,hosting,functions

echo
echo "Deployment complete: https://${PROJECT_ID}.web.app/"
