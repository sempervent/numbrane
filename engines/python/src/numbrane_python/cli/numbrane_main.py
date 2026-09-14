"""Console entry ``numbrane`` — delegates to tools/numbrane_cli.py."""

from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    # Prefer repo tools CLI when developing from a checkout
    root = Path(__file__).resolve().parents[6]
    cli = root / "tools" / "numbrane_cli.py"
    if cli.is_file():
        runpy.run_path(str(cli), run_name="__main__")
        return
    # Fallback: import won't work if tools missing — print hint
    raise SystemExit(
        "NUMBRANE CLI requires tools/numbrane_cli.py in a repository checkout, "
        "or invoke: python tools/numbrane_cli.py"
    )


if __name__ == "__main__":
    main()
