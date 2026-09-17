import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// Supabase's newer key format (sb_publishable_...), replacing the old anon JWT.
// createClient() takes it exactly the same way - no other code changes needed.
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Cloud sync is entirely optional - the app works fully local-first without it. */
export const cloudSyncConfigured = Boolean(url && publishableKey)

export const supabase = cloudSyncConfigured ? createClient(url!, publishableKey!) : null
