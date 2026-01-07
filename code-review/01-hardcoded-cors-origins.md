# Issue: Hardcoded Tailscale CORS Origins

**Severity:** Medium
**File:** `backend/app/config.py`
**Lines:** 78-82

## Problem

Developer-specific Tailscale domains are hardcoded in the CORS origins configuration:

```python
"https://macbook.tailaef54e.ts.net:442",
"https://macbook.tailaef54e.ts.net:443",
"https://macbook.tailaef54e.ts.net:444",
```

These are machine-specific URLs that:
- Won't work for other developers
- Leak internal network naming conventions
- Clutter the production config with dev-only values

## Suggestion

Move these to environment variables or a local `.env` file:

```python
# In config.py
cors_origins: list[str] = Field(
    default_factory=lambda: [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    alias="CORS_ORIGINS",
)
```

Then in `.env.local` (gitignored):
```
CORS_ORIGINS=["http://127.0.0.1:5173","https://macbook.tailaef54e.ts.net:443"]
```

Alternatively, document why these are needed if they serve a specific purpose beyond local development.
