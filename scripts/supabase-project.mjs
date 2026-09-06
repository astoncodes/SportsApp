import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

export function hostedProject() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const inferred = url
    ? new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
    : undefined;
  const ref = process.env.SUPABASE_PROJECT_REF || inferred;
  if (!ref || !/^[a-z0-9]+$/.test(ref))
    throw new Error('Set SUPABASE_PROJECT_REF or a hosted EXPO_PUBLIC_SUPABASE_URL.');
  let token = process.env.SUPABASE_ACCESS_TOKEN;
  const saved = `${homedir()}/.supabase/access-token`;
  if (!token && existsSync(saved)) token = readFileSync(saved, 'utf8').trim();
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN or sign in with the Supabase CLI.');
  return { ref, token };
}
