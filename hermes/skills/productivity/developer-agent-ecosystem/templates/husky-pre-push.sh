#!/usr/bin/env sh
protected_branch='main'
current_branch=$(git symbolic-ref --short HEAD)

if [ "$current_branch" = "$protected_branch" ]; then
  echo "❌ Direct push to '$protected_branch' is not allowed. Please create a feature branch and open a pull request."
  exit 1
fi

branch_regex='^(Fix|Automation)/[A-Z]+-[0-9]+/.+$'

if ! echo "$current_branch" | grep -Eq "$branch_regex"; then
  echo "❌ Invalid branch name for push: '$current_branch'"
  echo "Branch name must follow one of these templates:"
  echo "  Fix/<JIRA_KEY>/<Component_name>"
  echo "  Automation/<JIRA_KEY>/<Component_name>"
  echo "Example: Fix/BC-64/Initial-Project-Setup"
  exit 1
fi

npx lint-staged
