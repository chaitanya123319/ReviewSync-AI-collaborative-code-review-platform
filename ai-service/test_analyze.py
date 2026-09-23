"""
Test script for the /analyze endpoint.

Sends a JavaScript snippet with:
  1. An obvious SQL injection vulnerability
  2. An unused variable

Verifies the AI correctly identifies both issues.

Usage:
  python test_analyze.py                       # uses localhost:8000
  API_URL=http://ai-service:8000 python test_analyze.py  # inside Docker
"""

import asyncio
import json
import os
import sys

import httpx

API_URL = os.environ.get("API_URL", "http://localhost:8000")

TEST_CODE = """\
const express = require('express');
const app = express();
const unusedConfig = { debug: true, verbose: false };

app.get('/users', async (req, res) => {
  const userId = req.query.id;
  const query = "SELECT * FROM users WHERE id = '" + userId + "'";
  const result = await db.query(query);
  res.json(result.rows);
});

app.listen(3000);
"""

EXPECTED_TYPES = {"security", "code_quality"}


async def main():
    print(f"\n🧪 Testing POST /analyze")
    print(f"   Target: {API_URL}")
    print(f"   Language: javascript")
    print(f"   Lines: {TEST_CODE.count(chr(10)) + 1}\n")

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{API_URL}/analyze",
            json={"code": TEST_CODE, "language": "javascript"},
        )

    print(f"   Status: {response.status_code}")

    if response.status_code == 503:
        print(f"\n   ⚠️  API key not set: {response.json()['detail']}")
        print("   Set OPENROUTER_API_KEY env var and try again.\n")
        sys.exit(1)

    if response.status_code != 200:
        print(f"\n   ❌ Unexpected status: {response.status_code}")
        print(f"   Body: {response.text}\n")
        sys.exit(1)

    data = response.json()
    issues = data.get("issues", [])

    print(f"\n   📋 Found {len(issues)} issue(s):\n")

    found_security = False
    found_unused = False

    for i, issue in enumerate(issues, 1):
        icon = {"critical": "🔴", "warning": "🟡", "info": "🔵"}.get(
            issue["severity"], "⚪"
        )
        print(f"   {icon} Issue #{i}")
        print(f"      Line:      {issue['line']}")
        print(f"      Type:      {issue['type']}")
        print(f"      Severity:  {issue['severity']}")
        print(f"      Title:     {issue['title']}")
        print(f"      Explain:   {issue['explanation'][:120]}...")
        print(f"      Fix:       {issue['suggested_fix'][:120]}...")
        print()

        if issue["type"] == "security" and issue["severity"] == "critical":
            found_security = True
        if issue["type"] in ("code_quality", "best_practice") and "unused" in issue["title"].lower():
            found_unused = True

    print("   ─── Assertions ───")
    passed = 0

    def check(condition: bool, label: str):
        nonlocal passed
        if condition:
            print(f"   ✅ {label}")
            passed += 1
        else:
            print(f"   ❌ {label}")

    check(len(issues) >= 2, f"At least 2 issues found (got {len(issues)})")
    check(found_security, "SQL injection flagged as critical security issue")
    check(found_unused, "Unused variable flagged as code quality issue")

    # Validate all issues have required fields
    all_valid = all(
        all(k in issue for k in ("line", "type", "severity", "title", "explanation", "suggested_fix"))
        for issue in issues
    )
    check(all_valid, "All issues have required fields")

    # Validate types and severities are from allowed sets
    valid_types = {"bug", "logical_error", "security", "performance", "code_quality", "best_practice"}
    valid_severities = {"critical", "warning", "info"}
    types_ok = all(issue["type"] in valid_types for issue in issues)
    sevs_ok = all(issue["severity"] in valid_severities for issue in issues)
    check(types_ok, "All issue types are valid")
    check(sevs_ok, "All severities are valid")

    print(f"\n   Results: {passed}/5 passed\n")
    sys.exit(0 if passed == 5 else 1)


if __name__ == "__main__":
    asyncio.run(main())
