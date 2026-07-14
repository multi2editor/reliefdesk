import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fails loudly during development if .env.local is missing
  console.warn(
    'Supabase env vars missing. Copy .env.example to .env.local and fill in your project values.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '');
