# Daybook

A static assignment and event planner backed by Firebase Authentication and Cloud Firestore.

## Firebase setup

1. The web app configuration for the Firebase project is in `firebase-config.js`. These identifiers are public client configuration, not service account credentials. To use a different Firebase project, replace them with that project's web app configuration.
2. In Authentication, enable the Email/Password and Google sign-in providers. Add your site's domain to Authentication's authorized domains (including `localhost` for local development).
3. Create a Cloud Firestore database and publish the rules in `firestore.rules`. The rules restrict each user's profile and plans to that user. Do not deploy the app with permissive test rules.
4. Serve the repository over HTTP, for example with `python -m http.server`, then open `http://localhost:8000/`. The routes are directories, so they also work when hosted under a project path such as `/WorkTracker/`. Configure your static host to serve directory index files.

The app requires internet access to load the Firebase SDK. New Google users are sent to the signup page to complete account setup. Appearance preferences and plans are stored in Firestore. On signup, the previous browser appearance preference is carried over if present. Existing browser-only plans are removed on successful sign-in rather than imported.
