# FilmIt 🎬

Content workflow app for creators — pick an idea, film it, upload it.

---

## Deploy in 10 Minutes

### Step 1 — Create a GitHub account
1. Go to [github.com](https://github.com)
2. Click **Sign up** — use your email, create a username and password
3. Verify your email

### Step 2 — Create the repository
1. Once logged in, click the **+** icon (top right) → **New repository**
2. Name it: `filmit`
3. Leave it **Public**
4. Click **Create repository**

### Step 3 — Upload the project files
1. On the new repo page, click **uploading an existing file**
2. Drag ALL the files/folders from the `filmit` folder you downloaded into the upload area
   - `app/` folder
   - `components/` folder
   - `package.json`
   - `next.config.js`
3. Scroll down, click **Commit changes**

### Step 4 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up** → choose **Continue with GitHub** (links your accounts automatically)
3. Click **Add New Project**
4. Find your `filmit` repo and click **Import**
5. Leave all settings as default — Vercel detects Next.js automatically
6. Click **Deploy**
7. In ~60 seconds you'll get a live URL like `filmit.vercel.app` 🎉

---

## Making Changes Later

Whenever you edit a file and commit it to GitHub, Vercel auto-deploys the update — usually live in under a minute.

To edit the look/content:
- `components/ContentHub.js` — the entire app UI and logic
- `app/globals.css` — global colors and fonts
- The `SAMPLE_IDEAS` array at the top of `ContentHub.js` — swap in your real content ideas

---

## Future Upgrades (when you're ready)

| Feature | Tool | Cost |
|---|---|---|
| User accounts / login | [Clerk](https://clerk.com) | Free up to 10k users |
| Cloud database (shared across users) | [Supabase](https://supabase.com) | Free tier generous |
| Accept payments / subscriptions | [Stripe](https://stripe.com) | 2.9% per transaction |
| Custom domain (filmit.com) | Namecheap / Google Domains | ~$12/yr |

---

## Local Development (optional)

If you want to run it on your computer before deploying:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

Requires Node.js 18+. Download at [nodejs.org](https://nodejs.org).
