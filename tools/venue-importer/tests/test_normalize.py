"""Tests for OSM sport-tag normalization.

Every tag string marked "live data" below was returned verbatim by an Overpass
query over Prince Edward Island or inner London. They are the reason this
module exists, so they are the cases it is tested against.
"""

from __future__ import annotations

import pytest

from venue_importer.normalize import (
    SportResolution,
    resolve_sport_tokens,
    split_sport_tokens,
)

ALIASES: dict[str, str | None] = {
    "basketball": "basketball",
    "soccer": "soccer",
    "five-a-side": "soccer",
    "seven-a-side": "soccer",
    "futsal": "soccer",
    "volleyball": "volleyball",
    "beachvolleyball": "volleyball",
    "tennis": "tennis",
    "pickleball": "pickleball",
    # Known and deliberately not served.
    "multi": None,
    "baseball": None,
    "horse_racing": None,
    "ice_skating": None,
    "fitness": None,
}


class TestSplitSportTokens:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("basketball", ["basketball"]),
            # live data — the common multi-sport pitch
            ("soccer;basketball", ["soccer", "basketball"]),
            # live data — stray space after the separator, London
            ("tennis; basketball", ["tennis", "basketball"]),
            # live data — London five-a-side cage
            ("seven-a-side;five-a-side;soccer", ["seven-a-side", "five-a-side", "soccer"]),
            # live data — a PEI community centre listing ten activities
            (
                "ice_hockey;ice_skating;basketball;volleyball;pickleball;fitness",
                [
                    "ice_hockey",
                    "ice_skating",
                    "basketball",
                    "volleyball",
                    "pickleball",
                    "fitness",
                ],
            ),
        ],
    )
    def test_splits_live_osm_values(self, raw: str, expected: list[str]) -> None:
        assert split_sport_tokens(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "   ", ";", ";;;"])
    def test_empty_inputs_yield_no_tokens(self, raw: str | None) -> None:
        assert split_sport_tokens(raw) == []

    def test_lowercases(self) -> None:
        assert split_sport_tokens("Basketball;SOCCER") == ["basketball", "soccer"]

    def test_drops_empty_segments(self) -> None:
        assert split_sport_tokens("soccer;;basketball;") == ["soccer", "basketball"]

    def test_deduplicates_preserving_first_seen_order(self) -> None:
        assert split_sport_tokens("soccer;basketball;soccer") == ["soccer", "basketball"]

    def test_output_satisfies_the_database_constraint(self) -> None:
        """Mirrors osm_sport_aliases_normalized: lowercase, trimmed, single token."""
        for token in split_sport_tokens("Tennis; Basketball;;SOCCER "):
            assert token == token.strip().lower()
            assert token != ""
            assert ";" not in token

    def test_does_not_repair_internal_whitespace(self) -> None:
        """A value we do not understand surfaces as-is rather than being rewritten."""
        assert split_sport_tokens("beach volleyball") == ["beach volleyball"]


class TestResolveSportTokens:
    def test_maps_a_single_sport(self) -> None:
        assert resolve_sport_tokens("basketball", ALIASES) == SportResolution(
            sports=("basketball",)
        )

    def test_maps_several_sports(self) -> None:
        resolution = resolve_sport_tokens("soccer;basketball", ALIASES)
        assert resolution.sports == ("soccer", "basketball")
        assert resolution.is_relevant

    def test_collapses_aliases_of_the_same_sport(self) -> None:
        """seven-a-side, five-a-side and soccer are all one sport to us."""
        resolution = resolve_sport_tokens("seven-a-side;five-a-side;soccer", ALIASES)
        assert resolution.sports == ("soccer",)

    def test_separates_ignored_from_mapped(self) -> None:
        resolution = resolve_sport_tokens("baseball;basketball", ALIASES)
        assert resolution.sports == ("basketball",)
        assert resolution.ignored == ("baseball",)
        assert resolution.unknown == ()

    def test_multi_is_ignored_not_mapped(self) -> None:
        """`multi` says a pitch is multi-use without saying which sports."""
        resolution = resolve_sport_tokens("multi", ALIASES)
        assert resolution.sports == ()
        assert resolution.ignored == ("multi",)
        assert not resolution.is_relevant

    def test_absent_token_is_unknown_not_ignored(self) -> None:
        """The distinction this whole module exists to preserve."""
        resolution = resolve_sport_tokens("football", ALIASES)
        assert resolution.unknown == ("football",)
        assert resolution.ignored == ()
        assert resolution.has_unknown

    def test_unknown_alongside_mapped_still_surfaces(self) -> None:
        """A venue is not 'handled' just because one of its tokens resolved."""
        resolution = resolve_sport_tokens("basketball;quidditch", ALIASES)
        assert resolution.sports == ("basketball",)
        assert resolution.unknown == ("quidditch",)
        assert resolution.has_unknown

    def test_unclassified_venue_is_not_relevant_but_still_needs_review(self) -> None:
        resolution = resolve_sport_tokens("hockey", ALIASES)
        assert not resolution.is_relevant
        assert resolution.has_unknown

    def test_untagged_venue_resolves_to_nothing(self) -> None:
        """38 of Charlottetown's pitches carry leisure=pitch and no sport at all."""
        resolution = resolve_sport_tokens(None, ALIASES)
        assert resolution == SportResolution()
        assert not resolution.has_unknown
        assert not resolution.is_relevant

    def test_stray_space_does_not_hide_a_sport(self) -> None:
        """The bug this guards against: ' basketball' matching nothing."""
        resolution = resolve_sport_tokens("tennis; basketball", ALIASES)
        assert resolution.sports == ("tennis", "basketball")
        assert resolution.unknown == ()

    def test_case_does_not_hide_a_sport(self) -> None:
        assert resolve_sport_tokens("Basketball", ALIASES).sports == ("basketball",)
