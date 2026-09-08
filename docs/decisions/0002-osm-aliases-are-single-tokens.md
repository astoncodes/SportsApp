# 0002 — An OSM sport alias is a single token

**Status:** accepted · Phase 0

## Context

OSM's `sport` key is semicolon-delimited and messier than the wiki implies. Values pulled from
live Overpass queries over PEI and inner London include:

```
soccer;basketball
tennis; basketball                  <- space after the separator
seven-a-side;five-a-side;soccer
ice_hockey;ice_skating;basketball;volleyball;pickleball;fitness;...
```

Any future importer must split on `;`, trims, and lowercases, then looks each token up in
`osm_sport_aliases`. If either the split or the trim is skipped, the lookup misses and the sport
is **silently lost** — the venue imports looking merely unclassified rather than broken.

## What went wrong first

The original constraint was `alias = lower(btrim(alias)) and alias <> ''`, with a test asserting
it rejected `'tennis; basketball'`. The test failed: `lower(btrim('tennis; basketball'))` is
`'tennis; basketball'`, unchanged. The stray space is _internal_, and `btrim` only touches the
ends.

The constraint was checking the wrong invariant. Trimming and lowercasing are about how a token is
written; the real rule is that an alias **is one token** and therefore cannot contain the
separator at all.

## Decision

```sql
constraint osm_sport_aliases_normalized check (
  alias = lower(btrim(alias))
  and alias <> ''
  and alias !~ '[;[:space:]]'
)
```

Each clause catches a distinct failure of the importer's normalization:

| Clause              | Catches                                                        |
| ------------------- | -------------------------------------------------------------- |
| `lower`/`btrim`     | `' basketball'`, `'Basketball'` — split happened, trim did not |
| `!~ '[;[:space:]]'` | `'tennis; basketball'` — the whole tag value stored unsplit    |

## Consequences

- A normalization bug fails loudly at write time rather than quietly dropping sports.
- Normalization must **not** repair internal whitespace. A value like
  `beach volleyball` is returned unchanged, fails to match any alias, and surfaces as _unknown_
  for a human to classify. Silently rewriting a value we do not understand would hide the fact
  that OSM contains something unexpected.
- `supabase/tests/001_schema_constraints.sql` proves the database rejects the bad forms.
  The unfinished Python importer and its unit tests have been removed; this
  database constraint remains the authority for future ingestion tools.
