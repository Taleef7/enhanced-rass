#!/usr/bin/env python3
"""
create_github_issues.py
-----------------------
Creates GitHub milestones and issues for the RASS modernization roadmap
(Phases B through G) from the JSON specification files in docs/issues/.

Usage:
    python3 scripts/create_github_issues.py \
        --token <GITHUB_TOKEN> \
        --repo Taleef7/enhanced-rass \
        [--phase B]          # optional: create only a specific phase
        [--dry-run]          # print what would be created without creating

Requirements:
    pip install requests

Environment variable alternative (avoids passing token on CLI):
    export GITHUB_TOKEN=<your_token>
    python3 scripts/create_github_issues.py --repo Taleef7/enhanced-rass
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library is required. Install it with: pip install requests")
    sys.exit(1)

ISSUES_DIR = Path(__file__).parent.parent / "docs" / "issues"
PHASE_FILES = {
    "B": "phase-b.json",
    "C": "phase-c.json",
    "D": "phase-d.json",
    "E": "phase-e.json",
    "F": "phase-f.json",
    "G": "phase-g.json",
}
RATE_LIMIT_DELAY = 1.0  # seconds between API calls to avoid secondary rate limits
_MAX_RETRIES = 3       # maximum number of retries for rate-limited requests


def github_api(
    method: str,
    path: str,
    token: str,
    payload: Optional[dict] = None,
    _retry: int = 0,
    _expected_404_ok: bool = False,
) -> Any:
    """Make a GitHub API call and return the parsed JSON response (dict or list).

    Returns None when:
    - The request fails with a non-retryable error
    - A 404 is received and _expected_404_ok is True (caller treats as "not found")

    Logs a warning for 422 Unprocessable Entity responses (e.g., validation
    errors) rather than silently returning None, so callers can see the reason.
    """
    url = f"https://api.github.com/{path.lstrip('/')}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    response = requests.request(method, url, headers=headers, json=payload, timeout=30)
    if response.status_code in (200, 201):
        return response.json()

    # Rate limit handling — prefer X-RateLimit-Reset (epoch) over Retry-After
    if response.status_code == 429 or (
        response.status_code == 403 and "rate limit" in response.text.lower()
    ):
        if _retry >= _MAX_RETRIES:
            print(f"  ❌ Rate limit exceeded after {_MAX_RETRIES} retries; giving up on {method} {path}")
            return None
        reset_epoch = response.headers.get("X-RateLimit-Reset")
        if reset_epoch:
            wait = max(0, int(reset_epoch) - int(time.time())) + 2  # +2 s buffer
        else:
            wait = int(response.headers.get("Retry-After", 60))
        print(f"  ⏳ Rate limited. Waiting {wait}s (retry {_retry + 1}/{_MAX_RETRIES})...")
        time.sleep(wait)
        return github_api(method, path, token, payload, _retry=_retry + 1,
                          _expected_404_ok=_expected_404_ok)

    # Expected "not found" — caller treats this as a normal "does not exist" signal
    if response.status_code == 404 and _expected_404_ok:
        return None

    # Validation error — log the reason so the caller can diagnose it
    if response.status_code == 422:
        try:
            detail = response.json().get("message", response.text[:200])
        except Exception:
            detail = response.text[:200]
        print(f"  ⚠️  Unprocessable (422) for {method} {path}: {detail}")
        return None

    # All other unexpected errors
    if response.status_code != 404:  # 404 already handled above if not expected
        print(f"  ❌ API error {response.status_code} for {method} {path}: {response.text[:200]}")
    return None


def get_or_create_milestone(
    repo: str, token: str, title: str, description: str, due_on: Optional[str], dry_run: bool
) -> Optional[int]:
    """Return the milestone number, creating it if it does not exist."""
    # Check both open and closed milestones so we don't try to recreate a closed one
    milestones = github_api("GET", f"repos/{repo}/milestones?state=all&per_page=100", token) or []
    for m in milestones:
        if m.get("title") == title:
            print(f"  ✅ Milestone already exists: '{title}' (#{m['number']}, state={m.get('state')})")
            return m["number"]

    if dry_run:
        print(f"  [DRY RUN] Would create milestone: '{title}'")
        return -1

    create_payload: dict = {
        "title": title,
        "description": description,
        "state": "open",
    }
    if due_on:
        create_payload["due_on"] = due_on  # ISO 8601, e.g. "2025-12-31T00:00:00Z"

    result = github_api("POST", f"repos/{repo}/milestones", token, create_payload)
    if result:
        print(f"  ✅ Created milestone: '{title}' (#{result['number']})")
        return result["number"]
    return None


def ensure_label(repo: str, token: str, name: str, color: str, dry_run: bool) -> None:
    """Create a label if it does not already exist."""
    # Pass _expected_404_ok=True so a missing label doesn't produce an error log
    existing = github_api(
        "GET", f"repos/{repo}/labels/{requests.utils.quote(name)}", token,
        _expected_404_ok=True,
    )
    if existing:
        return  # already exists
    if dry_run:
        print(f"  [DRY RUN] Would create label: '{name}'")
        return
    github_api("POST", f"repos/{repo}/labels", token, {"name": name, "color": color})
    time.sleep(RATE_LIMIT_DELAY)


LABEL_COLORS = {
    "enhancement": "a2eeef",
    "phase-b": "0075ca",
    "phase-c": "0052cc",
    "phase-d": "003d99",
    "phase-e": "7057ff",
    "phase-f": "e4e669",
    "phase-g": "d93f0b",
    "ingestion": "c2e0c6",
    "retrieval": "bfd4f2",
    "observability": "f9d0c4",
    "enterprise": "fef2c0",
    "security": "ee0701",
    "evaluation": "0e8a16",
    "performance": "e4e669",
    "frontend": "84b6eb",
    "llm": "d4c5f9",
    "architecture": "cfd3d7",
    "devex": "c5def5",
    "documentation": "0075ca",
    "showcase": "b60205",
    "stretch": "e11d48",
}


def issue_exists(repo: str, token: str, title: str) -> bool:
    """Check if an issue with this exact title already exists (open or closed).

    Uses the GitHub Search API to search by title so the check is accurate
    regardless of how many issues the repository has.
    """
    query = requests.utils.quote(f'repo:{repo} is:issue in:title "{title}"')
    result = github_api("GET", f"search/issues?q={query}&per_page=10", token)
    if not result:
        return False
    for item in result.get("items", []):
        if item.get("title") == title:
            return True
    return False


def create_issue(
    repo: str,
    token: str,
    title: str,
    body: str,
    labels: list,
    milestone_number: Optional[int],
    dry_run: bool,
) -> None:
    """Create a single GitHub issue."""
    if dry_run:
        print(f"  [DRY RUN] Would create issue: '{title}'")
        return

    if issue_exists(repo, token, title):
        print(f"  ⏭  Issue already exists, skipping: '{title}'")
        return

    payload = {"title": title, "body": body, "labels": labels}
    if milestone_number and milestone_number > 0:
        payload["milestone"] = milestone_number

    result = github_api("POST", f"repos/{repo}/issues", token, payload)
    if result:
        print(f"  ✅ Created issue #{result['number']}: '{title}'")
    else:
        print(f"  ❌ Failed to create issue: '{title}'")

    time.sleep(RATE_LIMIT_DELAY)


def process_phase(phase_letter: str, repo: str, token: str, dry_run: bool) -> None:
    filename = PHASE_FILES[phase_letter]
    filepath = ISSUES_DIR / filename

    if not filepath.exists():
        print(f"  ❌ Phase file not found: {filepath}")
        return

    with open(filepath, encoding="utf-8") as f:
        phase_data = json.load(f)

    milestone_title = phase_data["milestone"]
    milestone_desc = phase_data.get("milestone_description", "")
    milestone_due_on = phase_data.get("due_on")  # ISO 8601 string or null
    issues = phase_data.get("issues", [])

    print(f"\n{'='*60}")
    print(f"Phase {phase_letter}: {milestone_title}")
    print(f"  {len(issues)} issues to create")
    print(f"{'='*60}")

    # Ensure all labels exist
    all_labels = set()
    for issue in issues:
        all_labels.update(issue.get("labels", []))
    for label in all_labels:
        ensure_label(repo, token, label, LABEL_COLORS.get(label, "ededed"), dry_run)

    # Create or fetch milestone (passes due_on when set in the phase JSON)
    milestone_number = get_or_create_milestone(
        repo, token, milestone_title, milestone_desc, milestone_due_on, dry_run
    )

    # Create all issues
    for issue in issues:
        create_issue(
            repo=repo,
            token=token,
            title=issue["title"],
            body=issue["body"],
            labels=issue.get("labels", []),
            milestone_number=milestone_number,
            dry_run=dry_run,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Create RASS modernization GitHub issues")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"), help="GitHub personal access token")
    parser.add_argument("--repo", default="Taleef7/enhanced-rass", help="Repository in owner/repo format")
    parser.add_argument("--phase", choices=list(PHASE_FILES.keys()), help="Create only a specific phase (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be created without creating anything")
    args = parser.parse_args()

    if not args.token:
        print("ERROR: GitHub token required. Pass --token or set GITHUB_TOKEN env var.")
        print("       Create a token at https://github.com/settings/tokens")
        print("       Required scopes: repo (full control of private repositories)")
        sys.exit(1)

    if args.dry_run:
        print("🔍 DRY RUN MODE — no changes will be made\n")

    phases_to_run = [args.phase] if args.phase else list(PHASE_FILES.keys())

    print(f"Repository: {args.repo}")
    print(f"Phases:     {', '.join(phases_to_run)}")
    print(f"Issues dir: {ISSUES_DIR}\n")

    # Verify the token works
    user = github_api("GET", "user", args.token)
    if not user:
        print("ERROR: Could not authenticate with the provided token.")
        sys.exit(1)
    print(f"Authenticated as: {user.get('login')}\n")

    for phase in phases_to_run:
        process_phase(phase, args.repo, args.token, args.dry_run)

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
