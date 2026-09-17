# Scatter

A freeform corkboard workspace: scatter notes, todo lists, and kanban boards on one draggable canvas, with a local AI assistant that can read your cards and help you plan.

- **Notes** support markdown and raw HTML, including interactive checkboxes (both `- [ ]` task-list syntax and `<input type="checkbox">`), with their checked state persisted independently of the source text.
- **Todo lists** and **kanban boards** are structured card types with their own editing UI.
- Everything is **local-first**, saved to IndexedDB in your browser (with a localStorage fallback so an edit right before closing the tab isn't lost). No account needed.
- Optional **account + cloud sync**: log in from Settings > Account to sync workspaces and images across devices, with a 20MB-per-account cap. See "Cloud sync setup" below - the app works fully local-only without this configured.
- The assistant runs a small LLM **entirely in your browser** via [WebLLM](https://webllm.mlc.ai/) (WebGPU), no API key, nothing leaves your machine. Needs a recent Chrome or Edge; the model downloads once (~1-2.4GB depending on which tier you pick) and is cached after that.

## Developing

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build
npm run lint     # oxlint
```

## Cloud sync setup (optional)

Cross-device sync runs on [Supabase](https://supabase.com) (Postgres + Auth + Storage, free tier). Without this configured, Scatter just works local-only and the Account section says so.

1. Create a free Supabase project.
2. In its SQL Editor, run [`supabase/migration.sql`](supabase/migration.sql) once. It creates the tables, Row Level Security policies, and the Postgres triggers that enforce the 20MB cap server-side (not just a client-side check).
3. In Storage, create a bucket named `images` and leave "Public" **off**.
4. In Auth > Providers > Email, you can turn off "Confirm email" for a simpler personal-use signup flow (optional).
5. From Project Settings > API Keys, copy the values into a `.env` file (see `.env.example`). This uses Supabase's newer key format - `sb_publishable_...` / `sb_secret_...` - rather than the older `anon`/`service_role` JWTs; same `createClient()` API either way, just get these from the API Keys page instead of the legacy Data API keys section.
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` - both safe to expose client-side.
   - `SUPABASE_SECRET_KEY` - **secret**, used only by `api/delete-account.ts` (the one serverless function this app has, since deleting an account requires Supabase's Admin API). Never prefix it with `VITE_`.
6. If deploying (e.g. Vercel), set the same three as environment variables there too.

Deleting your account removes your cloud data but never touches any device's local data - sync is additive, not the source of truth.
