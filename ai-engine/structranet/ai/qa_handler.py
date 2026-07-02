"""
qa_handler.py — Configuration QA using a local Cisco knowledge base.

Reads cisco_knowledge_base.txt (or a pre-built index) and answers
protocol/command questions. Returns formatted Markdown with code blocks.

Strategy:
  1. Load the knowledge base text once at module import (lazy singleton).
  2. For each QA request, extract relevant sections via hybrid search:
     BM25-style lexical scoring + Cisco semantic/acronym expansion.
  3. Pass the extracted context + user question to the LLM with a strict
     "answer in Markdown with IOS code blocks" prompt.
  4. If the knowledge base has no relevant content, fall back to the LLM's
     own knowledge (it still knows Cisco IOS).

The PDF uploaded by the user ("Cisco_General_Commands.pdf") has already been
parsed into text elsewhere. This module expects a plain-text version at:
  structranet/knowledge/cisco_knowledge_base.txt
"""

from __future__ import annotations

import logging
import math
import os
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from structranet.ai.llm_utils import _call_with_retry, _get_client

logger = logging.getLogger("structranet.qa_handler")

# Default path — override via env var QA_KNOWLEDGE_BASE_PATH
# qa_handler.py lives at structranet/ai/qa_handler.py
# parent = ai/, parent.parent = structranet/, so knowledge/ is structranet/knowledge/
_DEFAULT_KB_PATH = Path(__file__).parent.parent / "knowledge" / "cisco_knowledge_base.txt"
_KB_PATH = Path(os.getenv("QA_KNOWLEDGE_BASE_PATH", str(_DEFAULT_KB_PATH)))

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
    "for", "from", "how", "i", "in", "is", "it", "me", "of", "on", "or",
    "please", "show", "the", "to", "what", "when", "where", "which", "with",
}

_SEMANTIC_EXPANSIONS = {
    "redundancy": ["hsrp", "vrrp", "glbp", "standby", "virtual", "gateway"],
    "gateway": ["hsrp", "vrrp", "glbp", "standby"],
    "failover": ["hsrp", "vrrp", "glbp", "standby", "tracking"],
    "remote": ["ssh", "telnet", "vty", "line", "transport", "login"],
    "access": ["ssh", "telnet", "vty", "acl", "access-list"],
    "secure": ["ssh", "aaa", "password", "secret", "login", "access-class"],
    "security": ["acl", "access-list", "ssh", "aaa", "port-security", "snooping"],
    "rogue": ["dhcp", "snooping", "trusted", "untrusted"],
    "loop": ["spanning-tree", "stp", "bpduguard", "rootguard", "portfast"],
    "trunk": ["dot1q", "allowed", "native", "switchport"],
    "vlan": ["switchport", "trunk", "access", "vtp", "inter-vlan"],
    "routing": ["ospf", "eigrp", "bgp", "rip", "static", "route"],
    "summarize": ["summary-address", "area", "range", "aggregate-address"],
    "internet": ["nat", "pat", "overload", "default-route"],
    "translate": ["nat", "pat", "overload", "inside", "outside"],
    "monitor": ["show", "debug", "logging", "syslog", "snmp"],
    "troubleshoot": ["show", "debug", "ping", "traceroute"],
    "save": ["write", "memory", "copy", "startup-config", "running-config"],
    "backup": ["copy", "tftp", "startup-config", "running-config"],
    "etherchannel": ["port-channel", "channel-group", "lacp", "pagp"],
    "lag": ["etherchannel", "port-channel", "channel-group", "lacp"],
}

_ACRONYM_EXPANSIONS = {
    "aaa": ["authentication", "authorization", "accounting", "tacacs", "radius"],
    "acl": ["access-list", "permit", "deny", "access-group"],
    "bgp": ["router", "neighbor", "remote-as", "network"],
    "dhcp": ["pool", "excluded-address", "snooping", "relay"],
    "eigrp": ["router", "network", "autonomous", "summary-address"],
    "glbp": ["load", "balancing", "gateway"],
    "hsrp": ["standby", "priority", "preempt", "tracking"],
    "nat": ["inside", "outside", "overload", "pat"],
    "ospf": ["router", "network", "area", "passive-interface"],
    "ssh": ["vty", "transport", "login", "username", "rsa"],
    "stp": ["spanning-tree", "portfast", "bpduguard"],
    "vrrp": ["virtual", "priority", "preempt"],
}


# ═══════════════════════════════════════════════════════════════════════════════
#  Knowledge base loader  (lazy, cached)
# ═══════════════════════════════════════════════════════════════════════════════

@lru_cache(maxsize=1)
def _load_knowledge_base() -> str:
    """Load the knowledge base text once and cache it. Returns empty string on failure."""
    if not _KB_PATH.exists():
        logger.warning("Knowledge base not found at %s — QA will use LLM memory only.", _KB_PATH)
        return ""
    try:
        text = _KB_PATH.read_text(encoding="utf-8")
        logger.info("Knowledge base loaded: %d chars from %s", len(text), _KB_PATH)
        return text
    except Exception as exc:
        logger.error("Failed to load knowledge base: %s", exc)
        return ""


def _tokenize(text: str) -> list[str]:
    """Tokenize command/reference text while preserving Cisco-style terms."""
    return [
        tok
        for tok in re.findall(r"[a-z0-9][a-z0-9_-]*", text.lower())
        if tok not in _STOPWORDS and len(tok) > 1
    ]


def _expand_query_tokens(tokens: list[str]) -> set[str]:
    expanded = set(tokens)
    for token in tokens:
        expanded.update(_SEMANTIC_EXPANSIONS.get(token, []))
        expanded.update(_ACRONYM_EXPANSIONS.get(token, []))
    return expanded


def _extract_phrases(query: str) -> list[str]:
    lowered = query.lower()
    quoted = re.findall(r"`([^`]+)`|\"([^\"]+)\"", lowered)
    explicit = [a or b for a, b in quoted if a or b]
    commandish = re.findall(
        r"\b(?:show|debug|router|switchport|ip|ipv6|access-list|line|interface|"
        r"spanning-tree|standby|vrrp|glbp|copy|write|logging|snmp)\s+[a-z0-9_./ -]+",
        lowered,
    )
    return [p.strip() for p in explicit + commandish if len(p.strip()) >= 4]


def _split_kb_sections(kb_text: str) -> list[str]:
    """Split KB text into heading sections, tolerant of PDF encoding artifacts."""
    sections: list[str] = []
    current: list[str] = []
    for line in kb_text.splitlines():
        stripped = line.strip()
        is_heading = (
            stripped.startswith("Layer ")
            or stripped.startswith("■ ")
            or stripped.startswith("â–")
        )
        if is_heading and current:
            sections.append("\n".join(current).strip())
            current = []
        current.append(line)
    if current:
        sections.append("\n".join(current).strip())
    return [section for section in sections if section]


@lru_cache(maxsize=1)
def _build_kb_index() -> dict[str, Any]:
    """Build a dependency-free hybrid search index for the Cisco KB."""
    kb_text = _load_knowledge_base()
    if not kb_text:
        return {"sections": [], "avgdl": 0.0, "idf": {}}

    raw_sections = _split_kb_sections(kb_text)
    sections = []
    doc_freq: Counter[str] = Counter()

    for idx, raw in enumerate(s.strip() for s in raw_sections if s.strip()):
        if raw.startswith("Layer ") and "#" not in raw:
            continue
        tokens = _tokenize(raw)
        if not tokens:
            continue
        counts = Counter(tokens)
        doc_freq.update(counts.keys())
        lines = raw.splitlines()
        heading = lines[0].strip() if lines else f"Section {idx + 1}"
        sections.append({
            "id": idx,
            "heading": heading,
            "text": raw,
            "tokens": tokens,
            "counts": counts,
            "length": len(tokens),
        })

    total_docs = len(sections)
    avgdl = sum(s["length"] for s in sections) / total_docs if total_docs else 0.0
    idf = {
        token: math.log(1 + (total_docs - freq + 0.5) / (freq + 0.5))
        for token, freq in doc_freq.items()
    }
    logger.info("QA hybrid index built: %d sections", total_docs)
    return {"sections": sections, "avgdl": avgdl, "idf": idf}


def _bm25_score(query_tokens: set[str], section: dict[str, Any], idf: dict[str, float], avgdl: float) -> float:
    if not query_tokens or not section["length"] or not avgdl:
        return 0.0
    k1 = 1.4
    b = 0.75
    score = 0.0
    counts = section["counts"]
    doc_len = section["length"]
    for token in query_tokens:
        tf = counts.get(token, 0)
        if not tf:
            continue
        denom = tf + k1 * (1 - b + b * doc_len / avgdl)
        score += idf.get(token, 0.0) * (tf * (k1 + 1) / denom)
    return score


def _extract_relevant_sections(kb_text: str, topic: str, max_chars: int = 4000) -> str:
    """
    Hybrid section extractor.

    Combines BM25-style lexical ranking, semantic query expansion for common
    Cisco intents/acronyms, and exact phrase/command boosts. This keeps command
    precision while improving recall for natural-language questions.
    """
    if not kb_text:
        return ""

    index = _build_kb_index()
    sections = index["sections"]
    if not sections:
        return ""

    base_tokens = _tokenize(topic)
    base_set = set(base_tokens)
    expanded_tokens = _expand_query_tokens(base_tokens)
    phrases = _extract_phrases(topic)

    scored: list[tuple[float, str]] = []
    for section in sections:
        section_token_set = set(section["tokens"])
        lexical = _bm25_score(base_set, section, index["idf"], index["avgdl"])
        semantic = len(expanded_tokens & section_token_set) / max(len(expanded_tokens), 1)
        heading_bonus = 1.5 if any(token in section["heading"].lower() for token in base_set) else 0.0
        phrase_bonus = sum(2.0 for phrase in phrases if phrase in section["text"].lower())
        intent_bonus = 0.0
        if "remote" in base_set and {"ssh", "vty", "telnet"} & section_token_set:
            intent_bonus += 3.0
        if {"secure", "security"} & base_set and {"ssh", "aaa", "hardening", "access-class"} & section_token_set:
            intent_bonus += 2.5
        if "rogue" in base_set and {"dhcp", "snooping"} & section_token_set:
            intent_bonus += 3.0
        if {"redundancy", "failover"} & base_set and {"hsrp", "vrrp", "glbp", "standby"} & section_token_set:
            intent_bonus += 3.0
        score = lexical + (semantic * 3.0) + heading_bonus + phrase_bonus + intent_bonus
        if score > 0:
            scored.append((score, section["text"]))

    scored.sort(key=lambda x: x[0], reverse=True)

    collected = []
    total = 0
    for _, section in scored[:6]:
        if total + len(section) > max_chars:
            remaining = max_chars - total
            if remaining > 200:
                collected.append(section[:remaining])
            break
        collected.append(section)
        total += len(section)

    return "\n\n".join(collected)


def _build_qa_prompt(topic: str, context: str) -> str:
    has_context = bool(context.strip())
    context_block = (
        f"REFERENCE MATERIAL FROM KNOWLEDGE BASE:\n```\n{context}\n```\n"
        if has_context
        else "No specific reference material found — use your own IOS knowledge.\n"
    )

    return f"""You are StructuraNet AI, a Cisco IOS expert assistant.
The user is asking about: {topic}

{context_block}

Answer the user's question clearly and concisely.
RULES:
1. Always put IOS commands inside a Markdown fenced code block with the 'ios' language tag.
2. Group related commands logically with short explanatory headings.
3. If the exact answer isn't in the reference, use your own IOS knowledge.
4. Keep explanatory prose brief — the commands are the star.
5. End with a tip or warning if relevant.

Respond with clean Markdown. No preamble like "Sure!" or "Great question!".
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════════════════════

def answer_qa(user_message: str, topic: Optional[str] = None) -> str:
    """
    Answer a Cisco configuration / command question.

    Args:
        user_message: The full user question.
        topic:        The extracted topic from intent classification (e.g. "OSPF").
                      If None, the full user_message is used as the topic.

    Returns:
        Markdown-formatted answer string.
    """
    effective_topic = topic or user_message
    kb_text = _load_knowledge_base()
    context = _extract_relevant_sections(kb_text, effective_topic)

    if context:
        logger.info(
            "QA: found %d chars of relevant context for topic '%s'",
            len(context), effective_topic,
        )
    else:
        logger.info("QA: no context found for topic '%s' — using LLM memory", effective_topic)

    client = _get_client()
    system_prompt = _build_qa_prompt(effective_topic, context)

    try:
        def _call():
            return client.chat.completions.create(
                model=os.getenv("AI_MODEL", "openrouter/owl-alpha"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_message},
                ],
                max_tokens=2048,
            )

        response = _call_with_retry(_call)
        if response and response.choices:
            return response.choices[0].message.content or "_No answer generated._"

    except Exception as exc:
        logger.error("QA LLM call failed: %s", exc)

    return (
        "_Sorry, I couldn't retrieve the answer right now. "
        "Please check the Cisco documentation for details._"
    )


def build_cisco_kb_from_pdf_text(pdf_text: str, output_path: Optional[str] = None) -> str:
    """
    Utility: persist extracted PDF text as the knowledge base file.

    Call this once during setup if you're bootstrapping from the uploaded PDF.
    """
    path = Path(output_path or str(_KB_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(pdf_text, encoding="utf-8")
    # Clear the LRU cache so next call re-reads
    _load_knowledge_base.cache_clear()
    _build_kb_index.cache_clear()
    logger.info("Knowledge base written to %s (%d chars)", path, len(pdf_text))
    return str(path)
