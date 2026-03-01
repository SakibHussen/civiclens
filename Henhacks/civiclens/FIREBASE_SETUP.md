# Fix "auth/api-key-not-valid" — Create New Firebase Project

The fastest fix is to create a **brand new** Firebase project. New projects get unrestricted API keys that work with localhost.

## Step 1: Create New Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project** (or **Create a project**)
3. Name it (e.g. `civiclens-new`)
4. Disable Google Analytics if you don’t need it → **Create project**

## Step 2: Add Web App
1. Click the **Web** icon (`</>`) on the project overview
2. App nickname: `civiclens-web`
3. **Don’t** check Firebase Hosting
4. Click **Register app**
5. Copy the entire `firebaseConfig` object

## Step 3: Enable Email/Password Auth
1. Left sidebar → **Authentication**
2. Click **Get started**
3. **Sign-in method** tab → **Email/Password** → **Enable** → **Save**

## Step 4: Enable Firestore
1. Left sidebar → **Firestore Database**
2. **Create database** → Start in **test mode** (for development)
3. Pick a region → **Enable**

## Step 5: Update civiclens/.env
Paste the values from the Firebase config you copied:

```
VITE_FIREBASE_API_KEY=your-apiKey-here
VITE_FIREBASE_AUTH_DOMAIN=your-authDomain-here
VITE_FIREBASE_PROJECT_ID=your-projectId-here
VITE_FIREBASE_STORAGE_BUCKET=your-storageBucket-here
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messagingSenderId-here
VITE_FIREBASE_APP_ID=your-appId-here
```

Copy each field exactly — no quotes, no spaces around `=`, no commas.

## Step 6: Restart Dev Server
```bash
# Stop server (Ctrl+C), then:
cd civiclens && npm run dev
```

Then try **Sign Up** again in the app.
