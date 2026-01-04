---
description: Commit changes, push to remote, and create PR
---
1. Check git status
// turbo
`git status --short`

2. Check current branch
// turbo
`git branch --show-current`

3. Check recent history
// turbo
`git log -5 --oneline`

4. Analyze the context:
   - If on `main` or `master`, AUTO-GENERATE a descriptive branch name based on the staged changes and create it.
   - If already on a feature branch, proceed.

5. Stage and commit changes:
   - Stage files with `git add`.
   - Commit with a descriptive message using Conventional Commits (feat, fix, docs, etc.).

6. Push changes:
   `git push` (ensure upstream is set)

7. Create PR:
   - If `gh` CLI is installed: `gh pr create --web`
   - Else: Output the push response link to create a PR.
