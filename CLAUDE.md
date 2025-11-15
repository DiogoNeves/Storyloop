# Claude Guidelines

- When implementing async FastAPI or background handlers that need blocking helpers (e.g., Google client calls), prefer `anyio.to_thread.run_sync` or an equivalent to keep the event loop responsive.
