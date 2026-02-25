# Deployment Strategy (Cloudflare-Native)

This folder captures a high-level, phase-based strategy to move Storyloop to Cloudflare while reducing risk.

Core constraints for this migration:
- Confirm feasibility early (before deep refactors)
- No external deployment before auth is in place
- Verify each phase continuously
- Avoid data loss at all times
- Keep product feel close to today, just with multi-user support

## Phase order

1. [Phase 0 - Feasibility Spike (Python Workers + FastAPI)](./phase-0-feasibility.md)
2. [Phase 1 - Auth-First Foundation](./phase-1-auth-foundation.md)
3. [Phase 2 - CI/CD and Environment Pipeline](./phase-2-cicd-pipeline.md)
4. [Phase 3 - Storage Migration (D1 + R2)](./phase-3-storage-migration.md)
5. [Phase 4 - Multi-User Data Model and Isolation](./phase-4-multi-user.md)
6. [Phase 5 - Background Processing (Simple Native Path)](./phase-5-background-processing.md)
7. [Phase 6 - Optional AI Cost Optimization](./phase-6-optional-ai-optimization.md)

## Branching and PR strategy

Recommended approach:
- Create long-lived integration branch: `diogo/cloudflare-migration`
- Create short-lived phase branches from that branch, for example:
  - `diogo/cloudflare-phase-0`
  - `diogo/cloudflare-phase-1`
- Open PRs targeting `diogo/cloudflare-migration` (not `main`)
- Merge to `main` only after deployed behavior is confirmed end-to-end

Why this helps:
- Keeps `main` stable during the migration
- Allows incremental validation and rollback per phase
- Keeps review scope focused and auditable

## Non-negotiable verification policy

Every phase must end with:
- Automated checks (`make test`, `make build`)
- Phase-specific functional verification from that phase doc
- Data safety verification (backup/snapshot/restore test where relevant)
- Exit criteria met before starting the next phase
