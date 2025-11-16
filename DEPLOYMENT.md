# Deployment Guide

Complete guide for deploying the Cemetery Mapping System to Vercel (frontend) and Render (backend).

## Prerequisites

- GitHub account with this repository
- Vercel account (free tier works)
- Render account (free tier works)
- All code committed and pushed to GitHub

## Step 1: Deploy Backend to Render

### Option A: Using Blueprint (Recommended - Automated)

1. **Login to Render**: Visit [render.com](https://render.com) and sign in

2. **Create New Blueprint**:
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Select the `cemetery-mono` repository
   - Render will automatically detect `render.yaml`

3. **Review Configuration**:
   - Database: `cemetery-db` (PostgreSQL 16)
   - Web Service: `cemetery-backend` (Node.js)
   - Environment variables will be auto-configured

4. **Deploy**: Click "Apply" to create both services

5. **Initialize Database**:
   - Wait for deployment to complete
   - Go to `cemetery-backend` service
   - Click "Shell" tab
   - Run:
     ```bash
     npm run init-db
     ```
   - You should see success messages and default superadmin user created

6. **Note Backend URL**: Copy the URL (e.g., `https://cemetery-backend.onrender.com`)

### Option B: Manual Setup

1. **Create PostgreSQL Database**:
   - Click "New +" → "PostgreSQL"
   - Name: `cemetery-db`
   - Database: `cemetery_db`
   - User: `cemetery_user`
   - Region: Choose closest to you
   - PostgreSQL Version: 16
   - Click "Create Database"
   - Copy the "Internal Database URL"

2. **Create Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - Name: `cemetery-backend`
     - Region: Same as database
     - Root Directory: `backend`
     - Runtime: Node
     - Build Command: `npm install`
     - Start Command: `npm start`

3. **Add Environment Variables**:
   ```
   DATABASE_URL = [paste Internal Database URL from step 1]
   JWT_SECRET = [generate random string, e.g., use: openssl rand -base64 32]
   DB_SSL = true
   PORT = 4000
   NODE_ENV = production
   ```

4. **Deploy**: Click "Create Web Service"

5. **Initialize Database**: Follow step 5 from Option A above

## Step 2: Deploy Frontend to Vercel

1. **Login to Vercel**: Visit [vercel.com](https://vercel.com) and sign in

2. **Import Project**:
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Select `cemetery-mono`

3. **Configure Project**:
   - Framework Preset: Vite (should auto-detect)
   - Root Directory: Leave as `./` (vercel.json handles this)
   - Build Command: Should show `npm run build --workspace=frontend`
   - Output Directory: Should show `frontend/dist`

4. **Add Environment Variable**:
   - Click "Environment Variables"
   - Add:
     ```
     Name: VITE_API_BASE_URL
     Value: https://your-backend-name.onrender.com/api
     ```
   - **Important**: Replace `your-backend-name` with your actual Render backend URL
   - **Important**: Add `/api` at the end!

5. **Deploy**: Click "Deploy"

6. **Wait for Build**: Should complete in 1-2 minutes

7. **Get URL**: Copy your Vercel deployment URL (e.g., `https://cemetery-mono.vercel.app`)

## Step 3: Verify Deployment

1. **Test Backend**:
   - Visit: `https://your-backend.onrender.com/health`
   - Should return: `{"ok": true}`
   - Visit: `https://your-backend.onrender.com/`
   - Should return DB connection success message

2. **Test Frontend**:
   - Visit your Vercel URL
   - You should see the visitor home page
   - Navigate to login

3. **Test Integration**:
   - Try logging in with default superadmin credentials (from `init-db` output)
   - If login fails, check browser console for CORS or API errors

## Step 4: Update Default Credentials

1. Login as superadmin
2. Go to Settings → Change Password
3. Update email address
4. Create admin/staff accounts as needed

## Troubleshooting

### Backend Issues

**Database Connection Failed**
- Verify `DATABASE_URL` is correct in Render environment variables
- Ensure `DB_SSL=true` is set
- Check database is in same region as web service

**PostGIS Extension Missing**
- Render PostgreSQL includes PostGIS by default
- If error persists, check database logs

**Init Database Fails**
- Ensure database is fully provisioned (may take 1-2 minutes)
- Check Shell for specific error messages
- Verify database credentials are correct

### Frontend Issues

**API Requests Fail (Network Error)**
- Check `VITE_API_BASE_URL` in Vercel environment variables
- Ensure it ends with `/api` (e.g., `https://backend.onrender.com/api`)
- Verify backend is running (visit health endpoint)
- Check for CORS errors in browser console

**Blank Page / Build Errors**
- Check Vercel build logs for errors
- Ensure all dependencies are in `package.json`
- Try rebuilding: Deployments → ... → Redeploy

**Environment Variable Not Applied**
- After adding/changing env vars, you must redeploy
- Go to Deployments → Latest → ... → Redeploy

### CORS Issues

The backend has CORS enabled for all origins. If you still get CORS errors:
- Check that requests are going to `/api/...` endpoints
- Verify backend URL doesn't have trailing slash
- Check browser console for exact error

### Render Free Tier Cold Starts

- Free tier spins down after 15 minutes of inactivity
- First request after sleep takes 30-60 seconds
- Consider upgrading to paid tier for production use

## Environment Variables Reference

### Backend (Render)
```
DATABASE_URL=postgresql://user:pass@host:5432/cemetery_db
JWT_SECRET=your-secret-key-min-32-chars
DB_SSL=true
PORT=4000
NODE_ENV=production
```

### Frontend (Vercel)
```
VITE_API_BASE_URL=https://your-backend.onrender.com/api
```

## Updating Deployments

### Backend Updates
- Push changes to GitHub
- Render auto-deploys from main branch (if auto-deploy enabled)
- Or manually trigger deploy in Render dashboard

### Frontend Updates
- Push changes to GitHub
- Vercel auto-deploys from main branch
- Or manually trigger deploy in Vercel dashboard

## File Uploads Consideration

The current setup stores uploads in `backend/uploads/` on the Render server filesystem. This works but has limitations:
- Files are lost when service restarts/redeploys
- Not suitable for production with multiple instances

**For production**, consider:
- Cloudinary for images
- AWS S3 or similar
- Render Disks (persistent storage, paid feature)

## Database Backups

Render free tier doesn't include automatic backups. For production:
- Upgrade to paid plan with backups
- Or manually export database periodically:
  ```bash
  # In Render Shell
  pg_dump $DATABASE_URL > backup.sql
  ```

## Next Steps

1. ✅ Backend deployed and database initialized
2. ✅ Frontend deployed and connected to backend
3. ✅ Test all functionality
4. 🔧 Change default superadmin password
5. 🔧 Create admin/staff accounts
6. 🔧 Configure cemetery settings
7. 🔧 Set up custom domain (optional)
8. 🔧 Configure file upload storage (for production)
9. 🔧 Set up monitoring/logging (optional)

## Support

- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- PostGIS: https://postgis.net/documentation/

---

**Important Security Notes:**
- Always change default passwords immediately after deployment
- Keep JWT_SECRET secure and never commit to repository
- Consider implementing rate limiting for production
- Review and update CORS settings for production (restrict to your domain)
