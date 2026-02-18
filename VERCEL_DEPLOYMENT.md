# Deploying to Vercel

### 1. Push to GitHub
- Create a new repository on GitHub.
- Push your local code to that repository:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
  git push -u origin main
  ```

### 2. Connect to Vercel
- Go to [Vercel](https://vercel.com/) and Log in.
- Click **Add New... > Project**.
- Import your GitHub repository.

### 3. Configure Environment Variables
- During the "Configure Project" step, expand **Environment Variables**.
- Add each of the variables from your `.env.local`:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - ...and so on.

### 4. Deploy
- Click **Deploy**. Vercel will build and host your app.
- Once finished, you'll get a production URL!

**Note:** If Google Login doesn't work on the production URL, you must add the Vercel domain to the **Authorized Domains** list in the Firebase Console (Authentication > Settings > Authorized domains).
