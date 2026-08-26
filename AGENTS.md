# Hours Tracker project context

## User preferences

- Give clear, short, step-by-step instructions, especially for Firebase and Google Cloud console navigation.
- When asking the user to inspect something visual, identify the exact button, menu, row, or icon to click.
- The user may provide screenshots while troubleshooting; interpret the visible UI and guide them from their current screen.
- Preview app changes locally and wait for explicit approval before deploying them.

## Project

- The deployed Hours Tracker app is https://hours-tracker-505617.web.app/.
- Firebase project ID: `hours-tracker-505617`.
- Firebase configuration and built web assets are under `firebase/`.
- Cloud Functions source: `firebase/functions/index.js`.
- Deployment helper: `deploy-firebase.sh`.

## Google Sheets sync

- The Firestore-triggered function is `syncEntryToGoogleSheets` in region `us-central1`.
- It triggers for new documents at `users/{userId}/entries/{entryId}`.
- It appends rows to `Entries!A:O` using the spreadsheet ID from `GOOGLE_SHEET_ID` in `firebase/functions/.env`.
- Do not expose or copy the actual spreadsheet ID into documentation or chat.
- Recent troubleshooting reached Google Cloud Logs Explorer. A test invocation showed HTTP `POST 200`, but the user did not see the row in Google Sheets.
- The Sheets issue is intentionally deferred. When resumed, first verify the intended spreadsheet, the `Entries` tab, the final row, and active filters; then verify the deployed `GOOGLE_SHEET_ID` and add explicit success/error logging if needed.

## Current priority

- A local-only Quick Notes workflow is awaiting review. It stores unfinished drafts in `users/{userId}/quickNotes`, keeps them out of Google Sheets, lists them on the main page, and converts them into regular categorized entries only when finished.
