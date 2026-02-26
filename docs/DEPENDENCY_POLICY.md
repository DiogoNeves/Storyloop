# Dependency and License Policy

This project accepts dependencies that are compatible with MIT-licensed distribution.

## Allowed License Families

Generally acceptable:

- MIT, BSD-2-Clause, BSD-3-Clause, ISC, Apache-2.0, Python-2.0
- other permissive licenses compatible with MIT distribution

Needs manual review before merge:

- MPL-2.0
- CC-BY-* (data packages)
- dual-licensed packages where one branch is copyleft

Not accepted by default:

- GPL, AGPL, LGPL (unless explicitly approved and isolated)
- custom or unknown licenses without clear legal terms

## Dependency Update Rules

- Use pinned lockfiles (`uv.lock`, `pnpm-lock.yaml`).
- Prefer patch/minor upgrades unless major upgrades are required.
- Security updates should be prioritized.
- New direct dependencies require rationale in PR description.

## Required Checks for Dependency PRs

Run locally:

```bash
make lint
make test
make build
cd frontend && pnpm audit --prod --audit-level=high
cd ../backend && uv run --with pip-audit pip-audit
```

## Third-Party Notices

`THIRD_PARTY_NOTICES.md` is generated from package manager metadata. Regenerate when dependencies change:

```bash
uv run python scripts/generate_third_party_notices.py
```

## CI and Automation

- Dependabot is configured in `.github/dependabot.yml`.
- GitHub Actions and dependency updates are scanned continuously.

## References

- [GitHub Docs: Configuring Dependabot version updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates)
- [GitHub Docs: Dependency graph and dependency review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-the-dependency-graph)
- [SPDX License List](https://spdx.org/licenses/)
