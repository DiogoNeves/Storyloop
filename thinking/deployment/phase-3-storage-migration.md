# Phase 3 - Storage Migration (D1 + R2)

## Goal

Move storage safely from local SQLite/filesystem assumptions to Cloudflare-native storage.

## What counts as "assets" in Storyloop

Assets are user-uploaded or generated binary/text files, including:
- images
- PDFs
- plain text and SRT files
- audio uploads used for transcription flows

Recommended mapping:
- D1: relational metadata and references
- R2: binary/object payloads

## Scope

- Migrate relational tables to D1
- Move asset bytes to R2
- Keep asset metadata in D1
- Decide where extracted text lives (D1 vs R2) based on row-size and query constraints

## Data-loss prevention strategy

- Create immutable backups before any migration run
- Rehearse migration in non-prod with production-like snapshot
- Use checksum/hash validation for assets
- Keep a restore playbook and run one restore rehearsal
- Prefer additive/expand-and-contract migrations over destructive changes

## Verification checklist

- `make test` and `make build` pass
- Row-count parity between source and target for each table
- Referential integrity checks pass
- Asset object count and hash parity pass
- Random sample read test validates content correctness
- API smoke tests pass against migrated storage
- Restore drill succeeds from backup snapshot

## Exit criteria

Storage on D1/R2 is functionally equivalent, verified by parity checks and restore tests.
