# Product rules

Behaviour the product commits to. Derived from the canonical reference document (keep a copy at
`docs/reference.md`). System design is in [architecture.md](architecture.md).

Numeric values here are mirrored in `packages/shared` for form validation, and **enforced** by
migrations and database functions. The database is the authority.

---

## The product in one sentence

An app that shows where pickup sports are active now, lets players broadcast a short-lived on-site
check-in, and lists trustworthy recurring runs nearby.

It is a **presence and discovery tool** — not a chat app, not an event-management platform.

The loop: open the app → see nearby venues and current activity for your sports → open a venue →
check in if you're physically there, or see an upcoming run → the check-in disappears on its own
when it expires.

---

## Visibility

- Browsing may happen without an account. Checking in, creating a run, or submitting a venue
  requires one.
- Only `active` venues appear in public discovery.
- `pending` venue candidates are visible only to their submitter and to admins.
- `merged` venue URLs resolve to the canonical venue — old links keep working.
- `removed` venues disappear publicly but stay in the database for history and auditability.

---

## Check-ins

A check-in is a **status broadcast, not a negotiation**. That framing decides most of the rules
below: it is short, low-friction, and expires without anyone having to do anything.

- One open check-in per user at a time. Enforced by a partial unique index on
  `user_id where ended_at is null`, not by client logic.
- Belongs to one active venue and one sport that venue supports.
- Duration: **90 minutes** default, **30 minutes** minimum, **4 hours** maximum.
- Extendable, but the total active window cannot exceed 4 hours without a fresh location check.
- Checkout is explicit and immediate.
- `party_size` includes the checked-in user, defaults to 1, capped at 20.
- **A venue's live count is the sum of `party_size`, not the number of rows.** Someone who
  brought four friends counts as five players.
- Optional note: plain text, 120 characters. Never rendered as HTML.
- Expired check-ins are not publicly readable.

### Expiry cannot depend on a cleanup job

A check-in is active when:

```
ended_at is null and expires_at > now()
```

The UI, the counts, and every database function use exactly that predicate. A scheduled job may
set `ended_at`, but **correctness must never depend on it having run on time**. Stale check-ins —
"the app says five people are here, nobody is" — destroy trust in the product within a week, and
that failure must not be one missed cron away.

Client timers also remove a check-in from the UI at `expires_at` even if no database event arrives.

---

## Location gating and privacy

- Foreground location only. Requested when needed, never in the background.
- Browsing and scheduled runs work fine without location permission.
- Broadcasting "I'm here" requires a recent reading: within **250 m** of the venue, with reported
  accuracy of **100 m or better**.
- This is **an anti-abuse friction control, not proof of presence**. It raises the cost of a fake
  check-in; it does not verify identity or physical location, and it should not be described as
  though it does.
- **The submitted coordinate is used inside the check-in transaction and then discarded.** Only
  the distance to the venue, the reported accuracy, and the verdict are stored. The product needs
  to know a check-in was plausible; it does not need a history of where anyone has been.

---

## Recurring runs

Weekly series only in v1 — not arbitrary recurrence rules.

- A series has a local weekday, local start/end time, IANA timezone, start date, and `valid_until`.
- `valid_until` is at most **12 weeks** out from creation or renewal.
- Charlottetown defaults to `America/Halifax`.
- **Store local recurrence values, not one UTC instant.** A 7pm run must stay at 7pm across a
  daylight-saving change rather than quietly becoming 6pm.
- Organizers may edit, cancel, renew, or deactivate. A small exceptions table records a cancelled
  or time-shifted occurrence.
- Public queries return a bounded window — initially the next 14 days.

Runs go stale the same way check-ins do. A weekly run from an organizer who lost interest misleads
people for months, so a series must be renewed rather than living forever.

---

## User-submitted venues

Before the form opens, show every active venue within **150 m** and ask: **"Is it one of these?"**

Most duplicates come from someone failing to find an entry that already exists — usually because
it has no name. In a live sample of inner London, 606 of 627 pitches were unnamed; in
Charlottetown, not one basketball court has a name. Prevention beats cleanup.

If the user continues:

- Name, pin location, at least one sport, and indoor/outdoor/unknown are required.
- The server calculates nearby duplicate candidates.
- The submission enters `pending` or `possible_duplicate`.
- The submitter sees its status with an **Under review** label; other users do not see it at all,
  and it cannot host a public check-in until approved.
- An admin approves as new, approves by merging into an existing venue, or rejects.

Out of scope for v1: reporting, appeals, reputation scoring, community moderation.

---

## Venue verification

Publication state and verification are **different things** and must not be conflated:

- **Status**: `active`, `merged`, `removed` — is this venue published?
- **Verification**: `unverified`, `admin_verified`, `community_verified` — how much do we trust it?

For v1, a human-reviewed OSM venue or an approved submission may be marked `admin_verified`.

`community_verified` is a **reserved state with no automatic path into it**. Thresholds based on
distinct location-gated check-ins have to be designed from real usage data. Picking numbers now —
"5 check-ins from 3 users in 14 days" — would be inventing them with nothing to calibrate against.

---

## MVP scope

**In:** email auth and session persistence · profile with display name and sports · region-aware
venue map and list · sport filters · venue detail with current activity · location-gated check-in,
checkout, extension, auto-expiry · optional note and party size · weekly runs with renewal · OSM
import for Charlottetown · admin import review · user submissions with minimal approval ·
duplicate prevention and safe merges · realtime refresh · migrations, seed, generated types,
database tests.

**Out:** friends/followers/squads/feeds · direct messages or venue chat · photos, video,
highlights, comments · skill ratings and matchmaking · tournament brackets · push notifications ·
background location · public location history · automated verification thresholds · automatic
merging · automatic OSM-to-published reconciliation · multi-language · payments.

---

## Success

The MVP has validated the concept when a Charlottetown user can:

1. open the app and find a real nearby venue for a chosen sport
2. trust that duplicate or stale pins are uncommon and correctable
3. see whether players are there now
4. check in with low friction while physically nearby
5. watch that presence disappear reliably on checkout or expiry
6. find a recurring run without joining a social network

Early metrics: weekly actives · view-venue → check-in conversion · distinct venues with ≥1 check-in
per week · manual checkout vs expiry ratio · runs viewed and renewed · submissions prevented as
duplicates · venue corrections per active venue.

Do not optimize growth features until this loop is measurably used.

---

## Open decisions — owners only

Agents and contributors must **stop and ask** rather than silently choosing.

| Decision                  | Recommended default                                | Needed by            |
| ------------------------- | -------------------------------------------------- | -------------------- |
| App name and identifiers  | internal slug `pickup-sports`                      | store builds         |
| Auth method               | email one-time code first, social later            | Phase 2              |
| Browse without an account | allow read-only browsing                           | Phase 2              |
| Initial public sports     | basketball, soccer, volleyball, pickleball, tennis | Charlottetown launch |
| Check-in identity display | display name + avatar while active                 | Phase 3              |
| Location threshold        | 250 m, accuracy ≤100 m                             | Phase 3              |
| Party-size cap            | 20                                                 | Phase 3              |
| Run lifetime              | 12 weeks                                           | Phase 4              |
| Production map provider   | native platform maps, adapter seam kept            | public beta          |
| Venue correction flow     | admin contact form before community editing        | public beta          |

Seeded defaults reflect the recommended column. `ice-hockey` is seeded **inactive** — well
represented in PEI data, but rink access works differently from pickup play, so activating it is
an owner call.
