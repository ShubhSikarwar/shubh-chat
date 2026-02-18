# Firebase Setup Guide

To get this WhatsApp Clone working, follow these steps in the [Firebase Console](https://console.firebase.google.com/):

### 1. Create a Firebase Project
- Click "Add Project" and follow the prompts.

### 2. Enable Authentication
- Go to **Build > Authentication**.
- Click **Get Started**.
- Under the **Sign-in method** tab, select **Google**.
- Enable it, choose a support email, and click **Save**.

### 3. Create Firestore Database
- Go to **Build > Firestore Database**.
- Click **Create database**.
- Choose **Start in test mode** for now (you should update security rules later for production).
- Choose a location and finish setup.

### 4. Register Web App
- Go to **Project Settings** (the gear icon).
- Scroll down to "Your apps" and click the **Web icon (</>)**.
- Register the app as "WhatsApp Web Clone".
- You will see a `firebaseConfig` object. You'll need these values for your environment variables.

### 5. Add Security Rules (Optional but Recommended)
In the Firestore **Rules** tab, use these rules to allow users to see chats they are part of:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null;
    }
    match /chats/{chatId} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null;
      
      match /messages/{messageId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

---

# Environment Variables (.env)

Create a file named `.env.local` in the root of your project and add your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```
