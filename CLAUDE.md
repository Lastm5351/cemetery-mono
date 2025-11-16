# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cemetery GIS-Based Mapping and Tracking System with QR Integration for Garden of Peace. A full-stack web application with role-based access for managing cemetery plots, burial records, and visitor inquiries.

**Tech Stack:**
- Frontend: React 19 + Vite, React Router, Leaflet (GIS mapping), Tailwind CSS, Radix UI
- Backend: Node.js + Express, PostgreSQL with PostGIS extension
- Authentication: JWT-based with role-based access control

## Development Commands

### Root-level (monorepo)
```bash
# Install all dependencies (root + workspaces)
npm run install:all

# Start both frontend and backend concurrently
npm run dev

# Start only frontend (Vite dev server on port 5173)
npm run dev:frontend

# Start only backend (nodemon on port 4000)
npm run dev:backend

# Build frontend for production
npm run build

# Start production server (serves built frontend + API)
npm run start
```

### Frontend (in `frontend/` directory)
```bash
# Development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Backend (in `backend/` directory)
```bash
# Development with auto-reload
npm run dev

# Production server
npm start

# Initialize/reset database schema
npm run init-db
```

## Architecture

### Backend Structure

**Role System:** `super_admin` > `admin` > `staff` > `visitor`

**Routes** (`backend/routes/`)
- `/api/auth` - Login/logout/register
- `/api/superadmin` - User management (admin, staff, visitor accounts)
- `/api/admin` - Cemetery plots, burial records, cemetery info
- `/api/staff` - Tickets, burial schedules, maintenance requests
- `/api/visitor` - Public inquiries, search deceased
- `/api/plot` - Plot CRUD operations
- `/api/graves` - Burial record operations
- `/api/cemetery-info` - Cemetery metadata

**Controllers** (`backend/controllers/`) handle business logic for each route module.

**Middleware** (`backend/middleware/`)
- `auth.js` - JWT verification (`verifyToken`) and role checking (`requireRole`)
- `errorHandler.js` - Error handling middleware
- `upload.js` - Multer configuration for file uploads

**Database** (`backend/database/`)
- `improved_schema.sql` - PostgreSQL schema with PostGIS spatial functions
- `init_database.js` - Script to initialize database from schema
- Uses BIGSERIAL for `id`, CHAR(5) for `uid` with custom generator
- Key tables: `users`, `plots`, `burial_records`, `burial_schedules`, `maintenance_requests`, `visit_logs`

**Configuration**
- Database pool in `config/database.js` supports both connection string and individual env vars
- Auto-detects SSL requirement for Render hosting
- Server runs on port 4000 (default) and serves built frontend from `frontend/dist`

### Frontend Structure

**Routing** (`frontend/src/App.jsx`)
- `/visitor/*` - Public portal (home, search, inquire, login)
- `/staff/*` - Staff portal (tickets, burials, maintenance)
- `/admin/*` - Admin portal (plots, records, cemetery management)
- `/superadmin/*` - Super admin portal (user management, cemetery setup)
- Uses `ProtectedRoute` + `PortalGuard` to enforce role-based access

**Views** (`frontend/src/views/`)
```
views/
├── visitor/       # Public-facing pages
├── staff/         # Staff management pages
├── admin/         # Cemetery administration
├── superadmin/    # System administration
├── login/         # Authentication
└── components/    # Shared components
```

**Layouts**
- `RoleLayout` - Authenticated layout with Sidebar + Topbar
- `BareLayout` - Minimal layout for login/public pages
- `VisitorLayout` - Custom layout for visitor portal

**Key Components**
- GIS/Mapping: Leaflet integration for cemetery plot visualization
- QR Code: `qrcode` for generation, `qr-scanner` for reading
- UI: Radix UI primitives + custom components in `components/ui/`
- Auth: Client-side auth state in localStorage (`utils/auth.js`)

**API Communication**
- Base URL configured via Vite proxy or environment
- JWT token sent via Authorization Bearer header
- Uses axios for HTTP requests

### Authentication Flow

1. User logs in via `/api/auth/login`
2. Backend validates credentials, returns JWT + user object
3. Frontend stores in localStorage as `{ token, user: { id, role, ... } }`
4. Protected routes check token presence and role
5. Backend middleware verifies JWT and enforces role-based permissions

### Database Important Notes

- **PostGIS enabled** - spatial queries for plot locations
- Plot geometries stored as `GEOMETRY(Polygon, 4326)` (WGS84)
- Auto-generated UIDs for user-friendly references
- Initial superadmin user seeded during `init-db`
- Database connection tested at server startup (`/health` endpoint)

### Environment Variables Required

**Backend** (`.env` in `backend/`):
```
DB_USER=<postgres_user>
DB_HOST=<postgres_host>
DB_NAME=cemetery_db
DB_PASSWORD=<password>
DB_PORT=5432
DB_SSL=false              # Set true for Render/production
DATABASE_URL=<optional>   # Alternative to individual DB_* vars
JWT_SECRET=<secret_key>
PORT=4000
```

**Frontend**: API URL configured in Vite (defaults to http://localhost:4000)

## Deployment

This project supports multiple deployment options:

### Option 1: Both on Vercel (Recommended)
- **Frontend**: Vercel (static React app)
- **Backend**: Vercel (serverless functions)
- **Database**: External PostgreSQL with PostGIS (Neon, Render, or Supabase)
- See [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md) for complete guide

### Option 2: Frontend on Vercel, Backend on Render
- **Frontend**: Vercel (static React app)
- **Backend**: Render (Node.js API + PostgreSQL with PostGIS)
- See [DEPLOYMENT.md](DEPLOYMENT.md) for complete guide

### Vercel Deployment (Frontend)

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Configure build settings (auto-detected from `vercel.json`):
   - Build Command: `npm run build --workspace=frontend`
   - Output Directory: `frontend/dist`
4. Add environment variable:
   - `VITE_API_BASE_URL` = Your Render backend URL (e.g., `https://cemetery-backend.onrender.com/api`)
5. Deploy

### Render Deployment (Backend)

**Option 1: Using render.yaml (Blueprint)**
1. Push code to GitHub
2. In Render dashboard, create "New Blueprint Instance"
3. Connect repository and select `render.yaml`
4. Render will auto-create PostgreSQL database + web service
5. After deployment, manually run database initialization:
   - Go to backend service Shell
   - Run: `npm run init-db`

**Option 2: Manual Setup**
1. Create PostgreSQL database in Render:
   - Select PostgreSQL 16
   - Note the connection details
2. Create Web Service:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Add environment variables (or use Internal Database URL):
   - `DATABASE_URL` (from PostgreSQL service)
   - `JWT_SECRET` (generate strong random string)
   - `DB_SSL=true`
   - `PORT=4000`
4. Deploy, then run `npm run init-db` in Shell

### Post-Deployment Steps

1. **Initialize Database**: Run `npm run init-db` in Render Shell to create schema and seed superadmin
2. **Update Frontend**: Set `VITE_API_BASE_URL` in Vercel to point to Render backend
3. **Test**: Visit Vercel URL, login with default superadmin credentials
4. **CORS**: Backend already has `cors()` enabled for all origins

### Important Notes

- Backend requires PostgreSQL with **PostGIS extension** (Render supports this)
- Default superadmin credentials created by `init-db` - change after first login
- File uploads stored in `backend/uploads/` - consider cloud storage for production
- Render free tier may spin down after inactivity (cold starts)
