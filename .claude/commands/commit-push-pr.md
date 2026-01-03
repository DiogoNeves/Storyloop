---
description: Commit changes, push to remote, and create PR
---

# Git Status
!`git status --short`

# Current Branch
!`git branch --show-current`

# Recent Commits
!`git log -5 --oneline`

Based on git status above:

0. **If current branch is main** create a new branch for the changes.
1. **Stage and commit** changes with a descriptive message.
2. **Push** to the remote repository.
3. **Create PR** with:
   - Clear title summarising changes
   - Detailed description of what was done
   - Link to any related issues
   - Request review from appropriate team members

Use conventional commit format (feat:, fix:, docs:, etc.).
