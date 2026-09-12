-- Duplicate ranking is used by signed-in submission/import workflows.
-- Anonymous venue browsing uses nearby_venues instead.
revoke all on function public.find_duplicate_candidates(double precision,
  double precision, bigint[], double precision, uuid, text) from public, anon;
grant execute on function public.find_duplicate_candidates(double precision,
  double precision, bigint[], double precision, uuid, text) to authenticated;
