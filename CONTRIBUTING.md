# Contributing to Storyloop

Thanks for contributing.

## Before You Start

- Read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- Search existing issues before opening a new one.
- For security issues, use [SECURITY.md](./SECURITY.md) instead of public issues.

## What We Accept

- bug fixes with clear reproduction and tests
- improvements to docs and developer experience
- focused features aligned with project scope
- maintenance updates (deps, CI, tooling)

## Development Setup

1. Install prerequisites:
- Python 3.11
- Node.js 18+
- `uv`
- `pnpm`

2. Clone and install dependencies:

```bash
cd backend && uv sync
cd ../frontend && pnpm install
cd ..
```

3. Copy local environment settings:

```bash
cp .env.example .env
```

4. Start the app:

```bash
make dev
```

## Quality Gates (Required)

Run these before opening a PR:

```bash
make lint
make test
make build
```

## Pull Request Guidelines

- Keep PRs focused and small.
- Add or update tests for behavior changes.
- Explain the problem and solution clearly.
- Link related issues.
- Use descriptive commit messages (Conventional Commit style preferred).

## Branching

- Branch from `main`.
- Rebase or merge `main` before requesting review.

## Review Expectations

Reviewers prioritize:

- correctness and regression risk
- security and data-safety implications
- test coverage for changed behavior
- maintainability and clarity

## Dependency and License Requirements

- Keep dependency changes minimal and justified.
- Ensure all added dependencies have OSS-compatible licenses.
- Regenerate notices when dependencies change:

```bash
uv run python scripts/generate_third_party_notices.py
```

## References

This file follows patterns from:

- [GitHub contributing guidance](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-open-source)
- [GitHub Docs CONTRIBUTING](https://github.com/github/docs/blob/main/.github/CONTRIBUTING.md)
- [Vue contributing guide](https://github.com/vuejs/core/blob/main/.github/contributing.md)
