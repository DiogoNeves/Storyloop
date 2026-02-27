# Security Policy

This project follows responsible disclosure.

## Supported Versions

Security updates are provided for the latest commit on `main`.

| Version | Supported |
| --- | --- |
| `main` | :white_check_mark: |
| older branches/tags | :x: |

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for suspected vulnerabilities.

Report privately using one of these channels:

1. GitHub Security Advisory: use the repository's "Report a vulnerability" flow.
2. Email: `diogo.neves@gmail.com` with subject `Storyloop security report`.

Please include:

- affected endpoint, route, or component
- reproduction steps and proof-of-concept
- expected vs actual behavior
- impact assessment
- any proposed mitigation

## Disclosure Process

- We will acknowledge reports within 5 business days.
- We will provide a triage decision and next steps within 10 business days.
- We may ask for additional details during investigation.
- We will credit reporters (if desired) after a fix is released.

## Security Update Practices

- Dependency updates are automated through Dependabot.
- Dependency and code checks run in CI on pull requests and pushes.
- Secret scanning should be enabled in repository settings.

## Scope Notes

- Vulnerabilities in third-party services/providers should also be reported to those vendors.
- Issues requiring already-compromised local/dev machines are generally out of scope for this repository.

## References

- GitHub docs: [Adding a security policy](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)
- Example security policy style: [FastAPI SECURITY.md](https://github.com/fastapi/fastapi/blob/master/SECURITY.md)
- Disclosure policy style reference: [Node.js SECURITY.md](https://github.com/nodejs/node/blob/main/SECURITY.md)
