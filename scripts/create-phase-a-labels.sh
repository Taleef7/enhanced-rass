#!/usr/bin/env bash
# scripts/create-phase-a-labels.sh
# Creates or updates all labels needed for Phase A modernization issues.
# Requires GH_TOKEN environment variable with issues:write permission.

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-Taleef7/enhanced-rass}"

create_label() {
  local name="$1" color="$2" description="$3"
  if gh label list --repo "$REPO" --json name --jq '.[].name' | grep -qx "$name"; then
    gh label edit "$name" \
      --color "$color" \
      --description "$description" \
      --repo "$REPO" \
      && echo "Updated label: $name" \
      || echo "Could not update label: $name (skipping)"
  else
    gh label create "$name" \
      --color "$color" \
      --description "$description" \
      --repo "$REPO" \
      && echo "Created label: $name" \
      || echo "Could not create label: $name (skipping)"
  fi
}

create_label "phase-a"          "0075ca" "Phase A modernization work items"
create_label "refactor"         "e4e669" "Code refactoring and modularization"
create_label "enhancement"      "a2eeef" "New feature or improvement"
create_label "validation"       "d93f0b" "Schema and input validation"
create_label "documentation"    "0075ca" "Documentation improvements"
create_label "dx"               "bfd4f2" "Developer experience improvements"
create_label "good first issue" "7057ff" "Good for newcomers"

echo "Label setup complete."
