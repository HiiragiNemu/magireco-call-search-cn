#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
from pathlib import Path

MARKERS = (
    "height-export-title-call-rune-v10-20260817",
    "detectAlphabetGrid",
    "buildSmartMaskedFile",
    "__RUNE_V10__",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chunks", type=Path, default=Path(".automation/v10-final"))
    parser.add_argument("--output", type=Path, default=Path("public/myfile/runes-v10.js"))
    args = parser.parse_args()

    parts = sorted(args.chunks.glob("runes-v10.js.b64.*"))
    if len(parts) < 4:
        raise SystemExit(f"Expected at least four V10 chunks, found {len(parts)}")
    encoded = "".join(path.read_text(encoding="utf-8").strip() for path in parts)
    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except Exception as error:
        raise SystemExit(f"Unable to decode V10 rune source: {error}") from error

    if len(decoded.encode("utf-8")) < 32000:
        raise SystemExit(f"Decoded V10 rune source is unexpectedly short: {len(decoded)} characters")
    missing = [marker for marker in MARKERS if marker not in decoded]
    if missing:
        raise SystemExit(f"Decoded V10 rune source is missing markers: {missing}")
    if not decoded.rstrip().endswith("})(window);"):
        raise SystemExit("Decoded V10 rune source has an incomplete tail")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(decoded, encoding="utf-8")
    print(f"assembled={args.output} bytes={len(decoded.encode('utf-8'))} chunks={len(parts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
