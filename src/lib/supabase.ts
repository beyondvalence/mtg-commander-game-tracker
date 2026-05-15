import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    'Missing Supabase env vars - app will not be able to sync data. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your .env file',
  );
}

// Create client even with missing vars to prevent app from crashing
export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key');
