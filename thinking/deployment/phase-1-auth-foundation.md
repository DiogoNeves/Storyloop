# Phase 1 - Auth-First Foundation

## Goal

Introduce a real auth layer before any public deployment so all future data and API behavior are user-scoped and secure by default.

For the first protected deployment, use a two-step strategy:

1. **Immediate launch gate:** protect the app with Cloudflare Access so only allowlisted people can reach it.
2. **Subsequent public auth:** add a user identity provider (Clerk/Auth0) when you want real customer logins and multi-user account behavior.

## Recommended auth direction

Recommendation: managed auth provider with first-class React support and JWT verification in backend.

Primary recommendation:
- Clerk (modern DX, fast integration, session + JWT flows, social/email auth options)

Viable alternative:
- Auth0 (enterprise-ready, more configuration-heavy)

Note:
- Cloudflare itself does not replace product end-user auth for this use case.
- Cloudflare Access is excellent for internal app protection, but not a replacement for customer-facing app auth.

### Recommended launch posture (best fit for current setup)

- Start with **Cloudflare Access** now (private/internal launch, free-to-start path).
- Defer full user-account onboarding until phase 4 once storage migration and multi-user ownership changes are underway.
- Keep local data migration off for now; phase 1 can proceed without touching local DB shape.

Rationale:
- Cloudflare Access gives immediate route-level protection and keeps your API private while you validate Cloudflare feasibility and runtime behavior.
- It avoids adding user-management complexity before backend data ownership is fully refactored.

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

## Cloudflare Access bootstrap checklist (temporary perimeter-only stage)

### What to do in Cloudflare dashboard (security-critical)

1. Add and activate your domain in Cloudflare (DNS proxied).
2. Create a Zero Trust organization and enable Access for the account.
3. Add a self-hosted Access application for your app hostname:
   - Deny-by-default policy model (default deny).
   - Add one or more `Allow` rules (email/domain/group/IdP rule).
4. Pick a short session duration (start conservative, e.g. 1h) and tighten later.
5. Configure CORS/redirect behavior so failures are explicit, not silent redirects in API clients.
6. Validate requests to origin with Access tokens (`cf-access-jwt-assertion`) if origin might be reachable outside Cloudflare.

### Cloudflare-side inputs you need to provide

- App host (eg, `storyloop.your-domain.com`)
- Identity provider selection (Google/Microsoft/GitHub or your IdP)
- Access policy allowlist (emails/groups)
- Redirect URI / callback URLs for login flows
- Domain ownership in Cloudflare DNS

### Command-side steps (local/CI-side)

- `npx wrangler whoami` (verify auth in terminal)
- `npx wrangler login` (if using local deploy tooling)
- Deploy the app only after Access app is in place:
  - `make dev`/`make prod` during local validation
  - `wrangler deploy` or `wrangler pages deploy` depending on final runtime split

### Safety requirements for this stage

- Never store Cloudflare service tokens/API keys in repo files.
- Use scoped API tokens, not the global Cloudflare API key.
- Keep secrets environment-scoped in CI (or secret store), never in logs.
- Disable origin bypass paths (admin endpoints, health checks, static assets) that bypass Access.

## Exit criteria

No endpoint that reads/writes user data is callable without authenticated identity.

### Exit criteria for temporary Access-only stage

- App is unreachable without valid Access session.
- Access tokens are validated at origin or via secure proxy path.
- Access policy is deny-by-default and auditable.
- A follow-up ticket exists to implement true user identity (Clerk/Auth0) with user-scoped data ownership.
