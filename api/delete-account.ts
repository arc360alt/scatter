// Vercel Edge Function - the ONE place in this app that uses the Supabase secret key,
// because deleting an auth.users row requires the Admin API. Everything else talks to
// Supabase directly from the browser with the public publishable key, protected by RLS.
//
// Deleting the user cascades (via `on delete cascade` foreign keys, see
// supabase/migration.sql) to their workspaces/devices/usage rows. It does NOT touch this
// device's local IndexedDB data - that's intentional (see the confirm copy in the UI).

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response('Missing authorization', { status: 401 })
  }

  const url = process.env.VITE_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    return new Response('Server not configured', { status: 500 })
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verifies the token against Supabase's auth server (not just decoding it) before
  // deleting anything, so a caller can only ever delete their own account.
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return new Response('Invalid session', { status: 401 })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id)
  if (deleteError) {
    return new Response(deleteError.message, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
