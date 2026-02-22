# Phase 2 - CI/CD and Environment Pipeline

## Goal

Set up safe, repeatable CI/CD with phased environments so migration work can be validated continuously without risking production or data.

## Scope

- Keep current checks as baseline (`make test`, `make build`, lint)
- Add migration branch pipeline targeting non-production environments
- Add staged deploy model:
  - preview environment (per PR)
  - staging environment (integration branch)
  - production (manual promotion only)
- Manage environment-scoped secrets safely

## Verification checklist

- `make test` and `make build` run in CI on every PR
- Preview deployments are created for phase PRs
- Staging deploy from `diogo/cloudflare-migration` succeeds reliably
- Production deploy requires manual approval gate
- Secrets are environment-scoped and never logged
- Rollback to previous deployment is tested once and documented

## Exit criteria

Every phase can be verified in CI and in a non-prod deployed environment before merge.
