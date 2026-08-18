"""Configuration, read from the environment and the repo-root ``.env``.

The importer connects to Postgres with a privileged development credential and
therefore never runs anywhere near a client bundle. Everything it needs lives
in ``.env``, which is gitignored; ``.env.example`` documents the variables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

#: Public Overpass instances, tried in order. Both return HTTP 200 with an HTML
#: body when overloaded rather than a proper error status, so the caller must
#: verify the response actually parses as JSON before trusting it.
DEFAULT_OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or malformed."""


def _repo_root() -> Path:
    """Walk up from this file to the repository root (four levels up)."""
    return Path(__file__).resolve().parents[4]


def load_dotenv(path: Path | None = None) -> dict[str, str]:
    """Parse a ``.env`` file into a dict without adding a dependency.

    Understands ``KEY=value``, blank lines, ``#`` comments, an optional
    ``export`` prefix, and surrounding single or double quotes. It does not
    handle escapes or interpolation — if a value ever needs those, reach for a
    real parser rather than growing this one.
    """
    env_path = path if path is not None else _repo_root() / ".env"
    if not env_path.is_file():
        return {}

    values: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("export ").lstrip()

        key, separator, value = line.partition("=")
        if not separator:
            continue

        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        if key:
            values[key] = value

    return values


@dataclass(frozen=True)
class Config:
    """Everything the importer needs to run."""

    database_url: str
    overpass_endpoints: tuple[str, ...]
    overpass_user_agent: str


def load_config(environ: dict[str, str] | None = None) -> Config:
    """Build a :class:`Config`.

    With no argument, reads the ambient environment layered over the repo-root
    ``.env``, with real environment variables winning.

    With an explicit ``environ``, that mapping is the *whole* configuration and
    ``.env`` is not consulted. This keeps the function deterministic: a caller
    that passes ``{}`` gets a missing-configuration error, rather than whatever
    happens to be sitting in a developer's ``.env``. Merging the file in both
    cases made an "is this required?" test pass or fail depending on whether
    someone had set up their machine yet.
    """
    if environ is not None:
        source: dict[str, str] = dict(environ)
    else:
        source = dict(load_dotenv())
        source.update(os.environ)

    database_url = source.get("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise ConfigError(
            "SUPABASE_DB_URL is not set.\n"
            "Copy .env.example to .env and fill it in. For local Supabase:\n"
            "  SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres"
        )

    endpoints = (
        tuple(
            endpoint.strip()
            for endpoint in source.get("OVERPASS_ENDPOINTS", "").split(",")
            if endpoint.strip()
        )
        or DEFAULT_OVERPASS_ENDPOINTS
    )

    # The Overpass usage policy asks clients to identify themselves so that
    # operators can make contact instead of silently blocking the traffic.
    user_agent = source.get("OVERPASS_USER_AGENT", "").strip()
    if not user_agent:
        raise ConfigError(
            "OVERPASS_USER_AGENT is not set.\n"
            "The Overpass usage policy requires an identifying user agent with "
            "real contact details. See .env.example."
        )

    return Config(
        database_url=database_url,
        overpass_endpoints=endpoints,
        overpass_user_agent=user_agent,
    )
