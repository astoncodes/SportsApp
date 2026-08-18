/**
 * Build-time configuration.
 *
 * Everything here is compiled into the browser bundle and is readable by
 * anyone with devtools. Only the publishable (anon) key belongs in this file —
 * it is safe precisely because Row Level Security constrains what it can do.
 * The service-role key and the database password must never appear in a
 * VITE_-prefixed variable. See .env.example.
 *
 * References are static rather than dynamic (`import.meta.env[name]`) because
 * Vite substitutes these at build time by literal match.
 */

function required(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
        'Copy .env.example to .env at the repository root and fill it in.\n' +
        'Local Supabase prints the values you need when you run `npm run db:start`.',
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  supabaseAnonKey: required(import.meta.env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY'),
} as const;
