# C/Bell's Push-Up Challenge

Tactical push-up challenge web app with:
- Supabase auth (email/password)
- Name normalization to `C/...`
- Daily logging (today + yesterday only)
- Personal timer + click/space rep counter
- Session save + downloadable image card
- Daily / weekly / all-time leaderboards
- Goal settings + badge progression + motivation feed
- Realtime leaderboard refresh via Supabase Realtime

## Stack
- Frontend: React + TypeScript + Vite
- Data/Auth: Supabase Postgres + RLS + RPC
- Deploy: Netlify (with optional GitHub Actions)
- Container: Docker + Nginx

## Local Run
1. `cd web`
2. `copy .env.example .env`
3. `npm install`
4. `npm run dev`

## Supabase Setup
1. In Supabase SQL Editor, run file:
   - `supabase/migrations/202605230001_init_pushup_challenge.sql`
2. In Authentication settings, disable email confirmation if you want instant login after signup (optional).
3. Ensure project URL and anon key are in `web/.env`.

## Docker Run
1. From repo root: `docker compose up --build`
2. Open `http://localhost:8080`

## Netlify Deploy (manual)
1. Connect repository to Netlify.
2. Set build base directory: `web`
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variables in Netlify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## GitHub Actions Deploy (optional)
Add these repository secrets:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then push to `main` to trigger deployment.
