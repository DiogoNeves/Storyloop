from __future__ import annotations

import uvicorn


def main() -> None:
    """Launch the development server."""
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8001,
        reload=True,
        factory=False,
    )


if __name__ == "__main__":
    main()
