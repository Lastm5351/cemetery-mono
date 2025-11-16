# Backend Vercel Setup - Quick Guide

Step-by-step guide to deploy the backend to Vercel.

## Prerequisites

Before you start, you need:
1. ✅ Code pushed to GitHub
2. 🔧 A PostgreSQL database with PostGIS (we'll set this up first)

---

## Step 1: Create PostgreSQL Database (Neon - Recommended)

### Why Neon?
- Free tier with generous limits
- PostGIS support included
- Serverless (perfect for Vercel)
- No credit card required

### Setup:

1. **Go to [neon.tech](https://neon.tech)** and sign up (free)

2. **Create a new project**:
   - Click "Create a project" or "New Project"
   - Project name: `cemetery-db`
   - PostgreSQL version: 16
   - Region: Choose closest to you (e.g., US East, Europe, Asia)
   - Click "Create project"

3. **Enable PostGIS extension**:
   - After project is created, you'll see the Dashboard
   - Click "SQL Editor" in the left sidebar
   - In the query editor, paste and run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS postgis;
     ```
   - Click "Run" or press Ctrl+Enter
   - You should see "Success" message

4. **Get your connection string**:
   - Go back to "Dashboard"
   - You'll see "Connection Details" section
   - Copy the **Connection string**
   - It looks like: `postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/cemetery_db?sslmode=require`
   - **SAVE THIS** - you'll need it multiple times

---

## Step 2: Initialize Database Schema

You need to run this ONCE to create all tables and seed initial data.

### Option A: Run Locally (Easiest)

1. **Create `.env` file** in the `backend/` folder of your local project:
   ```env
   DATABASE_URL=postgresql://your-neon-connection-string-here
   DB_SSL=true
   JWT_SECRET=temporary-for-init-only
   ```

   Replace `postgresql://your-neon-connection-string-here` with the connection string from Step 1.

2. **Open terminal** in your project root

3. **Install backend dependencies**:
   ```bash
   npm install --workspace=backend
   ```

4. **Run initialization script**:
   ```bash
   npm run init-db --workspace=backend
   ```

5. **You should see output like**:
   ```
   🗄️ Initializing Cemetery Database...
   ✅ Database schema created successfully
   ✅ PostGIS version: 3.4.x
   ✅ Cemetery bounds: {...}
   ✅ Total plots inserted: 150
   🎉 Cemetery database initialization complete!
   ```

6. **Important**: Note the default superadmin credentials shown in the output!

### Option B: Can't Run Locally?

If you can't run Node.js locally:

1. Go to [replit.com](https://replit.com)
2. Create a new "Node.js" repl
3. Upload these two files:
   - `backend/database/init_database.js`
   - `backend/database/improved_schema.sql`
4. Click "Packages" and add: `pg`, `dotenv`
5. Click "Secrets" (lock icon) and add:
   - Key: `DATABASE_URL`
   - Value: Your Neon connection string
6. In the main file, add:
   ```javascript
   require('./init_database.js');
   ```
7. Click "Run"

---

## Step 3: Deploy Backend to Vercel

### 3.1 Go to Vercel Dashboard

1. Visit [vercel.com](https://vercel.com)
2. Sign in with GitHub

### 3.2 Import Project

1. Click "Add New..." button (top right)
2. Select "Project"
3. You'll see "Import Git Repository"
4. Find your `cemetery-mono` repository
5. Click "Import"

### 3.3 Configure Project Settings

**IMPORTANT**: Configure these settings carefully:

1. **Project Name**:
   - Enter: `cemetery-backend` (or whatever you prefer)

2. **Framework Preset**:
   - Select: "Other" (don't use auto-detect)

3. **Root Directory**: ⚠️ **CRITICAL**
   - Click "Edit" next to Root Directory
   - Select `backend` folder
   - Should show: `backend`

   This tells Vercel to deploy only the backend folder!

4. **Build and Output Settings**:
   - Build Command: Leave empty (or use default)
   - Output Directory: Leave empty
   - Install Command: `npm install` (should be default)

### 3.4 Add Environment Variables

This is where you configure your database and secrets:

1. **Expand "Environment Variables" section**

2. **Add these variables** (click "Add" for each):

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | Your Neon connection string from Step 1 |
   | `DB_SSL` | `true` |
   | `JWT_SECRET` | Generate a strong secret (see below) |
   | `NODE_ENV` | `production` |

   **How to generate JWT_SECRET**:
   - Open terminal and run: `openssl rand -base64 32`
   - Or visit: https://generate-secret.vercel.app/32
   - Or use any random 32+ character string
   - Example: `K8mY2vN9pL4jR6sT1wQ3xE5zC7bF0aG2`

3. **Ensure all 4 variables are added**

### 3.5 Deploy

1. Click **"Deploy"** button
2. Wait for deployment (usually 1-2 minutes)
3. You'll see build logs scrolling
4. Wait for "✓ Production deployment ready"

### 3.6 Get Your Backend URL

1. After successful deployment, you'll see your deployment URL
2. Click on it to visit
3. Copy the URL - it will look like: `https://cemetery-backend-xxx.vercel.app`
4. **SAVE THIS URL** - you'll need it for the frontend

---

## Step 4: Test Your Backend

### Test 1: Health Check

1. Visit: `https://your-backend.vercel.app/health`
2. You should see: `{"ok":true}`

### Test 2: Database Connection

1. Visit: `https://your-backend.vercel.app/`
2. You should see:
   ```json
   {
     "ok": true,
     "message": "✅ API + DB connection working",
     "time": "2024-11-16T..."
   }
   ```

If both tests pass, your backend is working! 🎉

### Test 3: API Endpoint

1. Visit: `https://your-backend.vercel.app/api/cemetery-info`
2. You should get JSON data about the cemetery

---

## Step 5: Connect Frontend to Backend

Now update your frontend to use the new backend:

1. **Go to Vercel Dashboard**
2. **Open your frontend project** (cemetery-mono or whatever you named it)
3. **Go to Settings** → **Environment Variables**
4. **Add new variable**:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://your-backend.vercel.app/api`

   ⚠️ **Important**:
   - Use YOUR backend URL from Step 3.6
   - Must end with `/api`
   - Example: `https://cemetery-backend-abc123.vercel.app/api`

5. **Redeploy frontend**:
   - Go to "Deployments" tab
   - Click "..." menu on latest deployment
   - Click "Redeploy"
   - Wait for redeployment to complete

---

## Step 6: Test Everything Together

1. **Visit your frontend URL** (e.g., `https://cemetery-mono.vercel.app`)

2. **Open browser DevTools**:
   - Press F12
   - Go to "Console" tab
   - Go to "Network" tab

3. **Navigate around the site**:
   - You should see the home page
   - Open Network tab and look for API calls
   - They should go to your backend URL

4. **Test Login**:
   - Go to login page
   - Use the superadmin credentials from Step 2
   - Try to log in
   - If successful, you're all set! 🎉

---

## Troubleshooting

### "Module not found" or build errors

**Problem**: Vercel can't find files or modules

**Solution**:
1. Go to your Vercel project settings
2. Check "Root Directory" is set to `backend`
3. Redeploy

### "Database connection failed"

**Problem**: Can't connect to Neon database

**Solution**:
1. Check your `DATABASE_URL` in Vercel environment variables
2. Make sure it includes `?sslmode=require` at the end
3. Verify `DB_SSL=true` is set
4. Test connection string locally first
5. Check Neon dashboard - database might be paused

### "Invalid or missing PostGIS"

**Problem**: PostGIS extension not enabled

**Solution**:
1. Go to Neon SQL Editor
2. Run: `CREATE EXTENSION IF NOT EXISTS postgis;`
3. Re-run init script if needed

### Frontend can't connect to backend

**Problem**: API calls fail with CORS or 404

**Solution**:
1. Check `VITE_API_BASE_URL` in frontend environment variables
2. Must end with `/api` - example: `https://backend.vercel.app/api`
3. NO trailing slash after `/api`
4. After changing env vars, MUST redeploy frontend
5. Clear browser cache

### Backend URL shows "404: NOT_FOUND"

**Problem**: Visiting backend root shows error

**Solution**:
- This might be normal if Vercel hasn't routed correctly
- Try `/health` endpoint instead
- Check `backend/vercel.json` exists and is correct

### "Function timeout" errors

**Problem**: Requests take too long and timeout

**Solution**:
- Vercel free tier has 10-second timeout
- Check if database queries are slow
- Verify database is in same region (or nearby)
- Consider upgrading to Hobby plan (60s timeout)

---

## Summary Checklist

- [ ] Neon database created
- [ ] PostGIS extension enabled
- [ ] Database initialized (`npm run init-db`)
- [ ] Backend deployed to Vercel
- [ ] Root directory set to `backend`
- [ ] Environment variables configured:
  - [ ] `DATABASE_URL`
  - [ ] `DB_SSL=true`
  - [ ] `JWT_SECRET`
  - [ ] `NODE_ENV=production`
- [ ] Backend `/health` endpoint works
- [ ] Backend `/` endpoint shows DB connection
- [ ] Frontend `VITE_API_BASE_URL` updated
- [ ] Frontend redeployed
- [ ] Can log in from frontend

---

## Important Notes

### File Uploads

⚠️ **Vercel is serverless** - files uploaded to `/uploads` folder won't persist!

After deployment or function restart, uploaded files disappear.

**For production, you MUST use cloud storage**:
- Cloudinary (recommended for images)
- AWS S3
- Vercel Blob
- Supabase Storage

### Environment Variables

- Changes to environment variables require redeployment
- They're only applied at build/runtime
- Keep them secret - never commit to Git

### Database

- Neon free tier: 3GB storage, 0.5GB RAM
- Enough for development and small production
- Database doesn't auto-scale - monitor usage

---

## Next Steps

After successful deployment:

1. **Change superadmin password** immediately
2. **Set up cloud storage** for file uploads
3. **Configure custom domain** (optional)
4. **Set up monitoring** (Vercel Analytics)
5. **Review CORS settings** for production

---

## Need Help?

- Vercel Docs: https://vercel.com/docs
- Neon Docs: https://neon.tech/docs
- Check [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md) for detailed guide
- Open browser DevTools Console/Network for debugging

Good luck! 🚀
