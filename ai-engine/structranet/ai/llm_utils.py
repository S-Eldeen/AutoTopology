"""
llm_utils.py — Shared LLM utility functions for Structranet AI

Consolidates the duplicate _get_client(), _call_with_retry(), and _extract_json()
functions that were previously duplicated in ai_agent.py and config_agent.py.

This module is the SINGLE SOURCE OF TRUTH for OpenAI client initialization,
transient-error retry logic, and LLM JSON extraction across the entire pipeline.
"""

import logging
import os
import random
import re
import time
from typing import Optional

from dotenv import load_dotenv
from openai import (
    OpenAI,
    APITimeoutError,
    APIConnectionError,
    RateLimitError,
    InternalServerError,
)

load_dotenv()

logger = logging.getLogger("structranet.llm_utils")


# ═══════════════════════════════════════════════════════════════════════════════
#  Safe env-var parsing helpers
# ═══════════════════════════════════════════════════════════════════════════════
# These helpers gracefully handle the case where an env var is set to an empty
# string or a non-numeric value. Without them, `float(os.getenv("X", "120"))`
# crashes with `ValueError: could not convert string to float: ''` when the var
# is present but empty (e.g. `LLM_CALL_TIMEOUT=` in .env). With them, an invalid
# value falls back to the default and logs a warning.


def _env_float(key: str, default: float) -> float:
    """Read a float env var, falling back to `default` on missing/invalid value."""
    raw = os.getenv(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except (ValueError, TypeError):
        logger.warning(
            "Invalid float for env var %s=%r — using default %s", key, raw, default,
        )
        return default


def _env_int(key: str, default: int) -> int:
    """Read an int env var, falling back to `default` on missing/invalid value."""
    raw = os.getenv(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except (ValueError, TypeError):
        logger.warning(
            "Invalid int for env var %s=%r — using default %s", key, raw, default,
        )
        return default


# Per-call timeout (seconds) — controls how long each individual API request
# may take before raising APITimeoutError.  Override via LLM_CALL_TIMEOUT env var.
_LLM_CALL_TIMEOUT = _env_float("LLM_CALL_TIMEOUT", 120.0)

# ═══════════════════════════════════════════════════════════════════════════════
#  Lazy singleton OpenAI client
# ═══════════════════════════════════════════════════════════════════════════════

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Return a lazily-initialized OpenAI client singleton.

    Reads ROUTER_API_KEY and ROUTER_BASE_URL from environment variables.
    Raises ValueError if the API key is missing.

    The per-request timeout defaults to the LLM_CALL_TIMEOUT env var (120s).
    """
    global _client
    if _client is None:
        key = os.getenv("ROUTER_API_KEY")
        base_url = os.getenv("ROUTER_BASE_URL")
        if not key:
            raise ValueError("ROUTER_API_KEY missing. Check your .env file.")
        _client = OpenAI(base_url=base_url, api_key=key, timeout=_LLM_CALL_TIMEOUT)
    return _client


# ═══════════════════════════════════════════════════════════════════════════════
#  Retry wrapper for transient API errors
# ═══════════════════════════════════════════════════════════════════════════════

# Rate-limit (429) errors get extra retries compared to other transient errors.
_RATE_LIMIT_MAX_RETRIES = 4


def _call_with_retry(func, max_retries: int = 3, call_timeout: Optional[float] = None):
    """Call *func* and retry on transient OpenAI errors.

    Exponential back-off with jitter: ``(2 ** attempt) + random.uniform(0, 1)``
    seconds between retries.

    Rate-limit (429) errors receive up to 4 retries and attempt to respect the
    ``Retry-After`` header when present.

    Raises the last exception if all retries are exhausted.

    Parameters
    ----------
    func : callable
        A zero-argument callable that performs the OpenAI API call.
    max_retries : int
        Maximum number of attempts for non-rate-limit errors (default 3 =
        one initial call + two retries).
    call_timeout : float or None
        Per-call timeout in seconds.  If provided, the OpenAI client's
        timeout is temporarily set to this value for the duration of the call.
        Defaults to the ``LLM_CALL_TIMEOUT`` env var (120 s).
    """
    effective_timeout = call_timeout if call_timeout is not None else _LLM_CALL_TIMEOUT
    client = _get_client()

    # Loop long enough to cover whichever error type needs the most attempts.
    total_attempts = max(max_retries, _RATE_LIMIT_MAX_RETRIES)

    for attempt in range(1, total_attempts + 1):
        try:
            # Temporarily override the client timeout for this call only.
            original_timeout = client.timeout
            client.timeout = effective_timeout
            try:
                return func()
            finally:
                client.timeout = original_timeout

        except APITimeoutError as e:
            if attempt < max_retries:
                wait = (2 ** attempt) + random.uniform(0, 1)
                logger.warning(
                    "API timeout (attempt %d/%d, timeout=%.1fs) — retry in %.1fs",
                    attempt, max_retries, effective_timeout, wait,
                )
                time.sleep(wait)
            else:
                logger.error(
                    "API timeout exhausted after %d attempts (timeout=%.1fs)",
                    max_retries, effective_timeout,
                )
                raise

        except RateLimitError as e:
            # 429 errors allow more retries and try to honour Retry-After.
            retry_after = None
            if hasattr(e, "response") and e.response is not None:
                retry_after_str = e.response.headers.get("retry-after")
                if retry_after_str:
                    try:
                        retry_after = float(retry_after_str)
                    except (ValueError, TypeError):
                        pass

            if attempt < _RATE_LIMIT_MAX_RETRIES:
                wait = retry_after if retry_after is not None else (2 ** attempt) + random.uniform(0, 1)
                hint = f"Retry-After: {retry_after}s" if retry_after is not None else "no Retry-After header"
                logger.warning(
                    "Rate limit hit (429, attempt %d/%d, %s) — retry in %.1fs",
                    attempt, _RATE_LIMIT_MAX_RETRIES, hint, wait,
                )
                time.sleep(wait)
            else:
                logger.error(
                    "Rate limit (429) exhausted after %d attempts",
                    _RATE_LIMIT_MAX_RETRIES,
                )
                raise

        except (APIConnectionError, InternalServerError) as e:
            if attempt < max_retries:
                wait = (2 ** attempt) + random.uniform(0, 1)
                logger.warning(
                    "Transient API error (attempt %d/%d): %s — retry in %.1fs",
                    attempt, max_retries, type(e).__name__, wait,
                )
                time.sleep(wait)
            else:
                raise

    return None


# ═══════════════════════════════════════════════════════════════════════════════
#  JSON extraction from messy LLM output
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_json(text: str) -> str:
    """Strip thought blocks and markdown fences, return raw JSON string.

    Handles three cases:
      1. Clean JSON (starts with '{', ends with '}')
      2. JSON wrapped in markdown code fences or preceded by <thought_process>
      3. JSON buried inside conversational text (regex rescue)
    """
    # Remove <thought_process>...</thought_process> blocks (some reasoning models)
    cleaned = re.sub(r"<thought_process>.*?</thought_process>", "",
                     text.strip(), flags=re.DOTALL)
    # Strip markdown code fences
    cleaned = re.sub(r"^```\w*\n?", "", cleaned.strip()).rstrip("`").strip()
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned
    # Last resort: find outermost { ... } block
    match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
    return match.group(1) if match else text
