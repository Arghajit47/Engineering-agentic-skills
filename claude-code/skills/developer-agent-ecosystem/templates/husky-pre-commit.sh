#!/usr/bin/env sh
branch_name=$(git symbolic-ref --short HEAD)
commit_msg_file="$1"

if [ -z "$commit_msg_file" ] || [ ! -f "$commit_msg_file" ]; then
  # When the hook is tested manually there is no commit message file; skip
  # commit-message validation so the branch-name check and lint-staged still run.
  commit_msg=""
else
  commit_msg=$(head -n 1 "$commit_msg_file")
fi

branch_regex='^(Fix|Automation)/[A-Z]+-[0-9]+/.+$'

if ! echo "$branch_name" | grep -Eq "$branch_regex"; then
  echo "❌ Invalid branch name: '$branch_name'"
  echo "Branch name must follow one of these templates:"
  echo "  Fix/<JIRA_KEY>/<Component_name>"
  echo "  Automation/<JIRA_KEY>/<Component_name>"
  echo "Example: Fix/BC-64/Initial-Project-Setup"
  exit 1
fi

jira_key=$(echo "$branch_name" | grep -oE '[A-Z]+-[0-9]+')
commit_regex="^${jira_key} [a-z0-9].*$"

if [ -n "$commit_msg" ] && ! echo "$commit_msg" | grep -Eq "$commit_regex"; then
  echo "❌ Invalid commit message: '$commit_msg'"
  echo "Commit message must follow the strict template:"
  echo "  <JIRA_KEY> <lowercase summarized message>"
  echo "Example: ${jira_key} initial project setup"
  exit 1
fi

npx lint-staged
