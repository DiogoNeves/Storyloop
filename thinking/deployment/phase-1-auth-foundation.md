# Phase 1 - Auth-First Foundation

## Goal

Introduce a real auth layer before any public deployment so all future data and API behavior are user-scoped and secure by default.

## Recommended auth direction

Recommendation: managed auth provider with first-class React support and JWT verification in backend.

Primary recommendation:
- Clerk (modern DX, fast integration, session + JWT flows, social/email auth options)

Viable alternative:
- Auth0 (enterprise-ready, more configuration-heavy)

Note:
- Cloudflare itself does not replace product end-user auth for this use case.
- Cloudflare Access is excellent for internal app protection, but not a replacement for customer-facing app auth.

## Product behavior target

Target UX: same app feel as today, but with account identity.

Expected product changes:
- Add sign-in/sign-up and session persistence
- Keep app navigation and core flows unchanged after login
- Add lightweight first-login setup only if needed
- Ensure user actions map to authenticated identity everywhere

## Verification checklist

- `make test` and `make build` pass
- Unauthenticated API requests to protected endpoints are rejected
- Authenticated requests succeed with user identity attached
- Session expiration and refresh behavior verified
- Logout fully invalidates session on client and backend
- Auth audit log/tracing available for sign-in and token failures

## Exit criteria

No endpoint that reads/writes user data is callable without authenticated identity.
