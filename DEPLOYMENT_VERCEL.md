# Deployment Guide - Both on Vercel

Complete guide for deploying both frontend and backend to Vercel. You'll need a separate PostgreSQL database (Render, Neon, or Supabase).

## Prerequisites

- GitHub account with this repository
- Vercel account (free tier works for both projects)
- Database hosting account (choose one):
  - **Neon** (recommended - generous free tier, PostGIS support)
  - **Render** (PostgreSQL free tier)
  - **Supabase** (free tier with PostGIS)

---

## Step 1: Set Up PostgreSQL Database

### Option A: Neon (Recommended)

1. **Sign up at [neon.tech](https://neon.tech)**

2. **Create Project**:
   - Click "Create Project"
   - Name: `cemetery-db`
   - PostgreSQL version: 16
   - Region: Choose closest to you
   - Click "Create Project"

3. **Enable PostGIS**:
   - Go to SQL Editor
   - Run: `CREATE EXTENSION IF NOT EXISTS postgis;`

4. **Get Connection String**:
   - Go to Dashboard
   - Copy "Connection string"
   - It looks like: `postgresql://user:password@host.neon.tech/cemetery_db?sslmode=require`
   - **Save this** - you'll need it for both backend deployment and database initialization

### Option B: Render PostgreSQL

1. **Sign up at [render.com](https://render.com)**

2. **Create PostgreSQL**:
   - Click "New +" → "PostgreSQL"
   - Name: `cemetery-db`
   - Database: `cemetery_db`
   - PostgreSQL Version: 16 (includes PostGIS)
   - Click "Create Database"

3. **Get Connection String**:
   - Copy "External Database URL" (not Internal)
   - Format: `postgresql://user:password@host.render.com:5432/cemetery_db`
   - **Save this** for later

### Option C: Supabase

1. **Sign up at [supabase.com](https://supabase.com)**

2. **Create Project**:
   - Click "New Project"
   - Name: `cemetery-db`
   - Database Password: (create strong password)
   - Region: Choose closest
   - PostGIS is included by default

3. **Get Connection String**:
   - Go to Project Settings → Database
   - Copy "Connection string" (URI format)
   - Replace `[YOUR-PASSWORD]` with your actual password
   - **Save this**

---

## Step 2: Initialize Database

You need to run the database initialization script locally or from any environment with Node.js:

### Method 1: Local Initialization (Recommended)

1. **Create `.env` file in `backend/` folder**:
   ```env
   DATABASE_URL=postgresql://your-connection-string-here
   DB_SSL=true
   JWT_SECRET=your-secret-key-here
   ```

2. **Install dependencies** (from project root):
   ```bash
   npm install --workspace=backend
   ```

3. **Run initialization**:
   ```bash
   npm run init-db --workspace=backend
   ```

4. **You should see**:
   ```
   🗄️ Initializing Cemetery Database...
   ✅ Database schema created successfully
   ✅ PostGIS version: ...
   ✅ Cemetery bounds: ...
   ✅ Total plots inserted: ...
   🎉 Cemetery database initialization complete!
   ```

5. **Note the default superadmin credentials** from the output

### Method 2: Online Node.js REPL

If you can't run locally:

1. Go to [replit.com](https://replit.com) or [codesandbox.io](https://codesandbox.io)
2. Create a Node.js project
3. Upload `backend/database/init_database.js` and `backend/database/improved_schema.sql`
4. Install dependencies: `npm install pg dotenv`
5. Set environment variable `DATABASE_URL`
6. Run the script

---

## Step 3: Deploy Backend to Vercel

1. **Go to Vercel Dashboard**: [vercel.com](https://vercel.com)

2. **Import Backend Project**:
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Select `cemetery-mono`

3. **Configure Backend Deployment**:
   - Project Name: `cemetery-backend` (or your choice)
   - Framework Preset: Other
   - **Root Directory**: `backend` ⚠️ **IMPORTANT**
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Install Command: `npm install`

4. **Add Environment Variables**:
   Click "Environment Variables" and add:

   ```
   DATABASE_URL = postgresql://your-connection-string-here
   JWT_SECRET = your-secret-key-min-32-chars
   DB_SSL = true
   NODE_ENV = production
   ```

   **Generate JWT_SECRET**:
   - Open terminal and run: `openssl rand -base64 32`
   - Or use online generator: https://generate-secret.vercel.app/32

5. **Deploy**: Click "Deploy"

6. **Wait for deployment** (1-2 minutes)

7. **Get Backend URL**:
   - Copy the deployment URL (e.g., `https://cemetery-backend.vercel.app`)
   - **Save this** for frontend configuration

8. **Test Backend**:
   - Visit: `https://your-backend.vercel.app/health`
   - Should return: `{"ok": true}`

---

## Step 4: Deploy/Update Frontend on Vercel

Since you already deployed the frontend, you just need to add the backend URL:

1. **Go to Your Frontend Project** in Vercel

2. **Go to Settings → Environment Variables**

3. **Add or Update**:
   ```
   VITE_API_BASE_URL = https://your-backend.vercel.app/api
   ```
   ⚠️ **Important**:
   - Use the backend URL from Step 3
   - Must end with `/api`
   - No trailing slash after `/api`

4. **Redeploy Frontend**:
   - Go to "Deployments" tab
   - Click "..." on latest deployment
   - Click "Redeploy"
   - OR just push a new commit to trigger auto-deploy

5. **Wait for redeployment**

---

## Step 5: Verify Deployment

1. **Test Backend**:
   ```bash
   curl https://your-backend.vercel.app/health
   # Should return: {"ok":true}

   curl https://your-backend.vercel.app/
   # Should return DB connection success
   ```

2. **Test Frontend**:
   - Visit your Vercel frontend URL
   - Should see the visitor home page
   - Open browser DevTools → Network tab

3. **Test Integration**:
   - Navigate to Login page
   - Try logging in with superadmin credentials from Step 2
   - Check Network tab - API calls should go to your backend URL
   - If login succeeds, deployment is complete! 🎉

---

## Troubleshooting

### Backend Issues

**"Module not found" errors**
- Ensure Root Directory is set to `backend` in Vercel project settings
- Check that `backend/package.json` exists

**Database connection fails**
- Verify `DATABASE_URL` is correct in environment variables
- Ensure `DB_SSL=true` is set
- Test connection string locally first
- For Neon: make sure connection string includes `?sslmode=require`

**"Function timeout" errors**
- Vercel free tier has 10-second timeout
- Hobby plan increases to 60 seconds
- Check if database queries are optimized

**PostGIS functions not working**
- Verify PostGIS extension is enabled in database
- Run: `SELECT PostGIS_Version();` in database console

### Frontend Issues

**API calls fail (404 or CORS)**
- Check `VITE_API_BASE_URL` in Vercel environment variables
- Must end with `/api` → `https://backend.vercel.app/api`
- NO trailing slash
- After changing env vars, you MUST redeploy

**Login fails silently**
- Open browser DevTools → Console
- Look for network errors
- Verify backend URL is correct
- Check backend is responding at `/health`

**Environment variable not applied**
- Environment variables are only applied at build time
- Must redeploy after adding/changing env vars
- OR use "Redeploy with existing build cache cleared"

### Database Issues

**Init script fails**
- Check connection string format is correct
- Ensure database is fully provisioned (may take 1-2 minutes)
- Verify PostGIS extension can be created (some hosts restrict this)

**Connection pool errors**
- Neon free tier: 100 max connections
- Render free tier: 97 max connections
- Vercel serverless functions create multiple connections
- Consider using connection pooling (PgBouncer) for production

---

## Important Notes

### File Uploads

⚠️ **Vercel serverless functions are stateless** - uploaded files won't persist!

Current upload directory (`backend/uploads/`) won't work on Vercel. You MUST use cloud storage:

**Options:**
1. **Cloudinary** (recommended for images)
2. **AWS S3**
3. **Vercel Blob Storage**
4. **Supabase Storage**

For now, uploads will appear to work but will disappear on next deployment or function restart.

### Database Connection Pooling

Vercel serverless functions can create many database connections. Consider:
- Using Neon (built-in pooling)
- Setting up PgBouncer
- Using Supabase (built-in pooling)

### Cold Starts

- Vercel free tier has cold starts (~1-2 seconds)
- Database connections may timeout if inactive
- First request after idle will be slower

### Costs

**Free tier limits:**
- Vercel: 100GB bandwidth/month, 100 serverless function hours
- Neon: 3GB storage, 0.5GB RAM, generous compute hours
- Render DB: 1GB storage, 97 connections
- Supabase: 500MB storage, 2GB bandwidth

All sufficient for development/small production use.

---

## Environment Variables Summary

### Backend (Vercel)
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=min-32-chars-random-string
DB_SSL=true
NODE_ENV=production
```

### Frontend (Vercel)
```
VITE_API_BASE_URL=https://your-backend.vercel.app/api
```

---

## Next Steps After Deployment

1. ✅ Backend deployed to Vercel
2. ✅ Frontend deployed to Vercel
3. ✅ Database initialized with schema
4. 🔧 Change default superadmin password
5. 🔧 Set up cloud storage for file uploads
6. 🔧 Configure custom domains (optional)
7. 🔧 Set up monitoring (Vercel Analytics)
8. 🔧 Consider upgrading plans for production

---

## Custom Domains (Optional)

### Backend Domain
1. Go to backend project → Settings → Domains
2. Add your custom domain (e.g., `api.yourdomain.com`)
3. Update DNS records as instructed
4. Update frontend `VITE_API_BASE_URL` to use custom domain

### Frontend Domain
1. Go to frontend project → Settings → Domains
2. Add your custom domain (e.g., `yourdomain.com`)
3. Update DNS records as instructed

---

## Support Resources

- Vercel Docs: https://vercel.com/docs
- Neon Docs: https://neon.tech/docs
- Render Docs: https://render.com/docs
- Supabase Docs: https://supabase.com/docs
- PostGIS: https://postgis.net/documentation/

---

**Security Checklist:**
- ✅ Changed default superadmin password
- ✅ JWT_SECRET is strong and secret
- ✅ Database credentials not in code
- ✅ CORS configured properly
- ✅ Environment variables set in Vercel (not in code)
