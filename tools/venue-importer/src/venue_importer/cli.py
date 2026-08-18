"""Command line entry point.

The command contract is fixed here in Phase 0 so it is documented and stable,
but the commands that write venue data are not implemented yet: the tables they
target (venue_import_batches, venue_source_records, venue_candidates) arrive in
Phase 1. They exit with a clear message rather than pretending to work.

    venue-importer normalize-sports "tennis; basketball"
    venue-importer import-region  --region charlottetown [--dry-run]
    venue-importer analyze-region --region charlottetown
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from . import __version__
from .config import ConfigError, load_config
from .normalize import resolve_sport_tokens, split_sport_tokens

PHASE_1_MESSAGE = (
    "Not implemented yet.\n"
    "\n"
    "This command writes to the venue staging tables, which land in Phase 1\n"
    "(see docs/architecture.md, 'Build sequence'). Phase 0 ships the package,\n"
    "the configuration loader, and the tested sport-tag normalizer.\n"
    "\n"
    'Working today:  venue-importer normalize-sports "tennis; basketball"'
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="venue-importer",
        description="Import OpenStreetMap sport venues into the pickup-sports staging tables.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--version", action="version", version=f"venue-importer {__version__}")

    subcommands = parser.add_subparsers(dest="command", metavar="COMMAND")

    normalize = subcommands.add_parser(
        "normalize-sports",
        help="Show how a raw OSM sport tag resolves against the alias map.",
        description=(
            "Split and resolve a raw OSM sport tag value. Useful for checking what a "
            "confusing tag will do before running a real import."
        ),
    )
    normalize.add_argument("tag", help='Raw OSM sport tag, e.g. "tennis; basketball"')
    normalize.set_defaults(handler=_run_normalize_sports)

    import_region = subcommands.add_parser(
        "import-region",
        help="[Phase 1] Fetch a region from Overpass into the staging tables.",
    )
    import_region.add_argument("--region", required=True, help="Region slug, e.g. charlottetown")
    import_region.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch, normalize and report without writing any rows.",
    )
    import_region.set_defaults(handler=_run_unimplemented)

    analyze_region = subcommands.add_parser(
        "analyze-region",
        help="[Phase 1] Summarize what a region's staged records look like.",
    )
    analyze_region.add_argument("--region", required=True, help="Region slug, e.g. charlottetown")
    analyze_region.set_defaults(handler=_run_unimplemented)

    check_config = subcommands.add_parser(
        "check-config",
        help="Verify the environment is configured, without contacting anything.",
    )
    check_config.set_defaults(handler=_run_check_config)

    return parser


def _run_normalize_sports(args: argparse.Namespace) -> int:
    """Resolve a tag using the seeded alias map.

    Phase 0 has no database connection, so this uses a small built-in map that
    mirrors supabase/seed.sql. Phase 1 replaces it with a real query so the two
    can never drift.
    """
    alias_map: dict[str, str | None] = {
        "basketball": "basketball",
        "soccer": "soccer",
        "five-a-side": "soccer",
        "seven-a-side": "soccer",
        "futsal": "soccer",
        "volleyball": "volleyball",
        "beachvolleyball": "volleyball",
        "tennis": "tennis",
        "pickleball": "pickleball",
        "multi": None,
        "baseball": None,
        "horse_racing": None,
    }

    tokens = split_sport_tokens(args.tag)
    resolution = resolve_sport_tokens(args.tag, alias_map)

    print(f"raw      {args.tag!r}")
    print(f"tokens   {', '.join(tokens) or '(none)'}")
    print(f"sports   {', '.join(resolution.sports) or '(none)'}")
    print(f"ignored  {', '.join(resolution.ignored) or '(none)'}")
    print(f"unknown  {', '.join(resolution.unknown) or '(none)'}")

    if resolution.has_unknown:
        print("\nUnknown tokens need a human decision. Add them to osm_sport_aliases")
        print("as either a mapping or an explicit ignore — never drop them silently.")

    return 0


def _run_check_config(_args: argparse.Namespace) -> int:
    try:
        config = load_config()
    except ConfigError as error:
        print(f"Configuration problem:\n\n{error}", file=sys.stderr)
        return 1

    # Never print the database URL: it contains a password.
    print("Configuration looks usable.")
    print(f"  database          {'set' if config.database_url else 'MISSING'}")
    print(f"  overpass agent    {config.overpass_user_agent}")
    print(f"  overpass endpoints ({len(config.overpass_endpoints)}):")
    for endpoint in config.overpass_endpoints:
        print(f"    - {endpoint}")
    return 0


def _run_unimplemented(_args: argparse.Namespace) -> int:
    print(PHASE_1_MESSAGE, file=sys.stderr)
    return 2


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if not getattr(args, "handler", None):
        parser.print_help()
        return 0

    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
