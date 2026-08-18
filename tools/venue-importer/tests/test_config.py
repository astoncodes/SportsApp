"""Tests for configuration loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from venue_importer.config import (
    DEFAULT_OVERPASS_ENDPOINTS,
    ConfigError,
    load_config,
    load_dotenv,
)

VALID_ENV = {
    "SUPABASE_DB_URL": "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "OVERPASS_USER_AGENT": "dropin-importer/0.1 (contact: dev@example.test)",
}


class TestLoadDotenv:
    def test_missing_file_is_not_an_error(self, tmp_path: Path) -> None:
        assert load_dotenv(tmp_path / "nope.env") == {}

    def test_parses_pairs_comments_and_blanks(self, tmp_path: Path) -> None:
        env_file = tmp_path / ".env"
        env_file.write_text(
            "\n".join(
                [
                    "# a comment",
                    "",
                    "SUPABASE_DB_URL=postgresql://localhost/db",
                    "export OVERPASS_USER_AGENT=agent/1.0",
                    'QUOTED="double quoted"',
                    "SINGLE='single quoted'",
                    "   SPACED   =   padded   ",
                    "NOT_A_PAIR",
                ]
            ),
            encoding="utf-8",
        )

        assert load_dotenv(env_file) == {
            "SUPABASE_DB_URL": "postgresql://localhost/db",
            "OVERPASS_USER_AGENT": "agent/1.0",
            "QUOTED": "double quoted",
            "SINGLE": "single quoted",
            "SPACED": "padded",
        }

    def test_keeps_urls_containing_equals_and_hash(self, tmp_path: Path) -> None:
        """A password with '=' or '#' in it must survive parsing intact."""
        env_file = tmp_path / ".env"
        env_file.write_text("SUPABASE_DB_URL=postgresql://u:p=a#b@host/db\n", encoding="utf-8")
        assert load_dotenv(env_file)["SUPABASE_DB_URL"] == "postgresql://u:p=a#b@host/db"


class TestLoadConfig:
    def test_builds_config_from_environment(self) -> None:
        config = load_config(dict(VALID_ENV))
        assert config.database_url.startswith("postgresql://")
        assert config.overpass_endpoints == DEFAULT_OVERPASS_ENDPOINTS

    def test_missing_database_url_explains_the_fix(self) -> None:
        environ = dict(VALID_ENV)
        environ["SUPABASE_DB_URL"] = ""

        with pytest.raises(ConfigError, match="SUPABASE_DB_URL"):
            load_config(environ)

    def test_missing_user_agent_is_rejected(self) -> None:
        """The Overpass usage policy requires an identifying agent."""
        environ = dict(VALID_ENV)
        del environ["OVERPASS_USER_AGENT"]

        with pytest.raises(ConfigError, match="OVERPASS_USER_AGENT"):
            load_config(environ)

    def test_endpoints_are_split_and_trimmed(self) -> None:
        environ = dict(VALID_ENV)
        environ["OVERPASS_ENDPOINTS"] = " https://a.example/api , https://b.example/api "

        assert load_config(environ).overpass_endpoints == (
            "https://a.example/api",
            "https://b.example/api",
        )

    def test_blank_endpoints_fall_back_to_defaults(self) -> None:
        environ = dict(VALID_ENV)
        environ["OVERPASS_ENDPOINTS"] = "   "

        assert load_config(environ).overpass_endpoints == DEFAULT_OVERPASS_ENDPOINTS

    def test_explicit_environ_ignores_the_dotenv_file(self) -> None:
        """An explicitly passed environ is the whole configuration.

        Regression test. This previously merged the repo-root .env underneath,
        which meant "is this variable required?" passed on a fresh clone and
        failed once a developer had set up their own .env — the test was
        measuring the machine, not the code.
        """
        with pytest.raises(ConfigError, match="SUPABASE_DB_URL"):
            load_config({})
