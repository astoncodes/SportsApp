"""Turning OSM ``sport`` tags into our sports.

OSM's ``sport`` key is a semicolon-delimited multi-value field, and real data is
messier than the wiki suggests. Every example in the tests below is a verbatim
value pulled from live Overpass queries over Prince Edward Island and inner
London::

    "basketball"
    "soccer;basketball"
    "tennis; basketball"                       <- note the space
    "seven-a-side;five-a-side;soccer"
    "ice_hockey;ice_skating;basketball;volleyball;pickleball;fitness;..."

Resolution has three outcomes, and keeping them distinct is the whole point:

    mapped   the token names a sport we serve
    ignored  we know this token and deliberately do not serve it
    unknown  we have never seen this token

``unknown`` is the one that matters. A token missing from the alias table must
reach a human reviewer, because that is how we find out OSM started using a tag
we have not considered. Silently dropping it loses venues invisibly.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

#: OSM joins multiple sports with this character.
TOKEN_SEPARATOR = ";"

#: Maps a normalized OSM token to one of our sport slugs, or to ``None``
#: meaning "known, deliberately ignored". A token ABSENT from the mapping is
#: unknown — which is a different thing from ignored, and must stay different.
#: Loaded from public.osm_sport_aliases; see supabase/seed.sql.
AliasMap = Mapping[str, str | None]


def split_sport_tokens(raw: str | None) -> list[str]:
    """Split a raw OSM ``sport`` tag value into normalized tokens.

    Lowercases and strips each token, drops empties, and removes duplicates
    while preserving first-seen order. The output is guaranteed to satisfy the
    ``osm_sport_aliases_normalized`` database constraint for every token that
    does not contain internal whitespace.

    Tokens with internal whitespace are returned unchanged rather than
    repaired. They will not match an alias and will surface as unknown, which
    is the correct outcome — quietly rewriting a value we do not understand
    would hide the fact that OSM contains something unexpected.
    """
    if not raw:
        return []

    seen: dict[str, None] = {}
    for segment in raw.split(TOKEN_SEPARATOR):
        token = segment.strip().lower()
        if token:
            seen.setdefault(token, None)

    return list(seen)


@dataclass(frozen=True)
class SportResolution:
    """The outcome of resolving one venue's sport tag against the alias map."""

    #: Slugs of sports we serve, in first-seen order, deduplicated.
    sports: tuple[str, ...] = ()
    #: Tokens present in the alias map and marked as deliberately ignored.
    ignored: tuple[str, ...] = ()
    #: Tokens absent from the alias map. These must be surfaced during review.
    unknown: tuple[str, ...] = ()

    @property
    def has_unknown(self) -> bool:
        """True when a human needs to classify at least one token."""
        return bool(self.unknown)

    @property
    def is_relevant(self) -> bool:
        """True when this venue supports at least one sport we serve.

        A venue with no mapped sports but unresolved unknown tokens is NOT
        irrelevant — it is unclassified, and rejecting it automatically would
        discard exactly the venues we most need a human to look at.
        """
        return bool(self.sports)


def resolve_sport_tokens(raw: str | None, alias_map: AliasMap) -> SportResolution:
    """Resolve a raw OSM ``sport`` tag value into mapped/ignored/unknown sets.

    A venue tagged ``"soccer;basketball"`` resolves to two sports. One tagged
    ``"multi"`` resolves to nothing mapped and one ignored token, because
    ``multi`` says the pitch is multi-use without saying which sports — the
    absence of information, not information about absence.
    """
    sports: dict[str, None] = {}
    ignored: dict[str, None] = {}
    unknown: dict[str, None] = {}

    for token in split_sport_tokens(raw):
        if token not in alias_map:
            unknown.setdefault(token, None)
            continue

        sport_slug = alias_map[token]
        if sport_slug is None:
            ignored.setdefault(token, None)
        else:
            sports.setdefault(sport_slug, None)

    return SportResolution(
        sports=tuple(sports),
        ignored=tuple(ignored),
        unknown=tuple(unknown),
    )
