"""Model-agnostic LLM client using the OpenRouter API."""

import json
import os
import re
import logging

import httpx

from .prompts import SYSTEM_PROMPT, RETRY_PROMPT, build_user_prompt
from .schemas import AnalysisResult

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
MODEL_NAME = os.environ.get("MODEL_NAME", "qwen/qwen3-coder-30b-a3b-instruct")
REQUEST_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "90"))


def _extract_json(text: str) -> str:
    """Try to extract a JSON object from LLM output that may include markdown fences or thinking blocks."""
    # Strip <think>...</think> blocks (reasoning models)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Strip markdown code fences if present
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()

    # Try to find a raw JSON object
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        return brace_match.group(0).strip()

    return text.strip()


def _parse_response(raw_text: str) -> AnalysisResult:
    """Parse and validate the LLM response against the Pydantic schema."""
    cleaned = _extract_json(raw_text)
    data = json.loads(cleaned)
    return AnalysisResult.model_validate(data)


def _extract_content(choice: dict) -> str:
    """Extract text content from an OpenRouter response choice, handling thinking models."""
    message = choice.get("message", {})

    # Standard content field
    content = message.get("content")
    if content:
        return content

    # Some models put output in reasoning field
    reasoning = message.get("reasoning")
    if reasoning:
        return reasoning

    # Fallback — try the full message as string
    raise ValueError(f"No content found in response. Message keys: {list(message.keys())}")


async def _call_openrouter(messages: list[dict]) -> str:
    """Make a single call to the OpenRouter API and return the text response."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reviewsync.ai",
        "X-Title": "ReviewSync AI",
    }

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(
            OPENROUTER_API_URL, headers=headers, json=payload
        )

    data = response.json()

    # Check for API-level errors
    if "error" in data:
        error_msg = data["error"].get("message", str(data["error"]))
        raise RuntimeError(f"OpenRouter API error: {error_msg}")

    if response.status_code != 200:
        raise RuntimeError(
            f"OpenRouter returned status {response.status_code}: {json.dumps(data)[:300]}"
        )

    if not data.get("choices"):
        raise RuntimeError(f"No choices in response: {json.dumps(data)[:300]}")

    return _extract_content(data["choices"][0])


async def get_review(code: str, language: str) -> AnalysisResult:
    """
    Send code to the LLM for review and return a validated AnalysisResult.

    If the first response fails JSON validation, retries once with a stricter prompt.
    """
    if not OPENROUTER_API_KEY:
        raise ValueError(
            "OPENROUTER_API_KEY environment variable is not set. "
            "Please provide your OpenRouter API key."
        )

    user_prompt = build_user_prompt(code, language)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    logger.info(
        "Calling LLM model=%s language=%s lines=%d",
        MODEL_NAME,
        language,
        code.count("\n") + 1,
    )

    # First attempt
    raw_text = await _call_openrouter(messages)
    logger.debug("LLM raw response (attempt 1): %s", raw_text[:500])

    try:
        result = _parse_response(raw_text)
        logger.info("Parsed %d issues on first attempt", len(result.issues))
        return result
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("First attempt failed to parse: %s. Retrying...", str(e))

    # Retry with stricter instruction
    messages.append({"role": "assistant", "content": raw_text})
    messages.append({"role": "user", "content": RETRY_PROMPT})

    raw_text_retry = await _call_openrouter(messages)
    logger.debug("LLM raw response (attempt 2): %s", raw_text_retry[:500])

    try:
        result = _parse_response(raw_text_retry)
        logger.info("Parsed %d issues on retry", len(result.issues))
        return result
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Retry also failed: %s", str(e))
        # Return empty issues rather than crashing
        return AnalysisResult(issues=[])
