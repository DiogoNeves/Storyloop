from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "THIRD_PARTY_NOTICES.md"


@dataclass(frozen=True, order=True, slots=True)
class PackageNotice:
    ecosystem: str
    name: str
    version: str
    license_name: str


def _run_json(command: list[str]) -> object:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def _load_frontend_notices() -> list[PackageNotice]:
    payload = _run_json(
        ["pnpm", "--dir", "frontend", "licenses", "list", "--json", "--prod"]
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Unexpected pnpm licenses JSON format")

    notices: set[PackageNotice] = set()
    for license_name, packages in payload.items():
        if not isinstance(license_name, str):
            continue
        if not isinstance(packages, list):
            continue

        for package in packages:
            if not isinstance(package, dict):
                continue
            name = str(package.get("name", "")).strip()
            versions = package.get("versions", [])
            if not name or not isinstance(versions, list):
                continue
            for version in versions:
                version_str = str(version).strip()
                if not version_str:
                    continue
                notices.add(
                    PackageNotice(
                        ecosystem="npm",
                        name=name,
                        version=version_str,
                        license_name=license_name,
                    )
                )

    return sorted(notices, key=lambda item: (item.name.lower(), item.version))


def _load_backend_notices() -> list[PackageNotice]:
    payload = _run_json(
        [
            "uv",
            "run",
            "--project",
            "backend",
            "--with",
            "pip-licenses",
            "pip-licenses",
            "--format=json",
        ]
    )
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected pip-licenses JSON format")

    notices: set[PackageNotice] = set()
    for package in payload:
        if not isinstance(package, dict):
            continue
        name = str(package.get("Name", "")).strip()
        version = str(package.get("Version", "")).strip()
        license_name = str(package.get("License", "")).strip()
        if not name or not version:
            continue
        notices.add(
            PackageNotice(
                ecosystem="python",
                name=name,
                version=version,
                license_name=license_name or "UNKNOWN",
            )
        )

    return sorted(notices, key=lambda item: (item.name.lower(), item.version))


def _render_table_rows(notices: Iterable[PackageNotice]) -> str:
    lines = ["| Ecosystem | Package | Version | License |", "| --- | --- | --- | --- |"]
    for notice in notices:
        lines.append(
            f"| {notice.ecosystem} | {notice.name} | {notice.version} | {notice.license_name} |"
        )
    return "\n".join(lines)


def generate_notices() -> str:
    frontend_notices = _load_frontend_notices()
    backend_notices = _load_backend_notices()
    generated_at = datetime.now(tz=UTC).replace(microsecond=0).isoformat()

    lines = [
        "# Third-Party Notices",
        "",
        "This file is auto-generated. Do not edit manually.",
        f"Generated at: `{generated_at}`",
        "",
        "Regenerate with:",
        "",
        "```bash",
        "uv run python scripts/generate_third_party_notices.py",
        "```",
        "",
        "## npm (frontend)",
        "",
        _render_table_rows(frontend_notices),
        "",
        "## Python (backend)",
        "",
        _render_table_rows(backend_notices),
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    OUTPUT_PATH.write_text(generate_notices(), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
