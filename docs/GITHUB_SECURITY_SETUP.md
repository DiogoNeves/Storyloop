# GitHub Security Setup

Some security controls must be enabled in repository settings (they cannot be fully enforced by code files alone).

## Enable Dependabot Alerts and Security Updates

1. Open repository `Settings` -> `Security & analysis`.
2. Enable:
- `Dependency graph`
- `Dependabot alerts`
- `Dependabot security updates`

## Enable Secret Scanning

In the same `Security & analysis` page, enable:

- `Secret scanning`
- `Push protection` (recommended)

Note: GitHub may block secret scanning on private repositories without the required plan/entitlements. If blocked, enable it after repository visibility/plan changes.

## Verify Automation

- Dependabot config exists at `.github/dependabot.yml`.
- Secret scanning workflow exists at `.github/workflows/secret-scan.yml`.
- Main CI exists at `.github/workflows/checks.yml`.

## References

- [GitHub Docs: About secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning)
- [GitHub Docs: Configuring Dependabot version updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates)
- [GitHub Docs: Security and analysis settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/about-security-and-analysis-settings)
