#!/usr/bin/env python3
"""Populate the lowest-priority V22 translation cache with an offline model.

This is used only by the supervisor when network translation was unavailable.
Official/client, manual, MagiReader and Wiki matches still override every cache
entry in the authoritative builder.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]")
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
CACHE = ROOT / ".automation" / "v22-machine-translation-cache.json"
MODEL = os.environ.get("V22_OFFLINE_MODEL", "Helsinki-NLP/opus-mt-ja-zh")


def walk(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, child in value.items():
            if isinstance(key, str):
                yield key
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def targets() -> list[Path]:
    output = []
    for path in PUBLIC.rglob("*.json"):
        rel = path.relative_to(PUBLIC).as_posix().casefold()
        if "story-title-groups" in path.name.casefold() or rel.endswith("data/story-v7/localization.json"):
            output.append(path)
    return sorted(set(output))


cache = {}
if CACHE.exists():
    try:
        raw = json.loads(CACHE.read_text(encoding="utf-8-sig"))
        if isinstance(raw, dict):
            cache = {str(k): str(v) for k, v in raw.items()}
    except Exception:
        pass

texts = set()
for path in targets():
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    for text in walk(data):
        text = text.strip()
        if KANA_RE.search(text) and 0 < len(text) <= 220 and not text.startswith(("http://", "https://")):
            texts.add(text)

pending = sorted(text for text in texts if not cache.get(text))
print(f"Offline fallback candidates: {len(pending)}")
if not pending:
    raise SystemExit(0)

try:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
except Exception as exc:
    raise SystemExit(f"Offline fallback dependencies unavailable: {exc}")

torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL)
model.eval()

batch_size = int(os.environ.get("V22_OFFLINE_BATCH", "24"))
translated = 0
with torch.inference_mode():
    for start in range(0, len(pending), batch_size):
        batch = pending[start:start + batch_size]
        encoded = tokenizer(batch, return_tensors="pt", padding=True, truncation=True, max_length=160)
        generated = model.generate(**encoded, max_new_tokens=160, num_beams=3, early_stopping=True)
        outputs = tokenizer.batch_decode(generated, skip_special_tokens=True)
        for source, target in zip(batch, outputs):
            target = re.sub(r"\s+", " ", target).strip()
            if target and target != source and not KANA_RE.search(target):
                cache[source] = target
                translated += 1
            else:
                cache.setdefault(source, "")
        if start % (batch_size * 10) == 0:
            CACHE.parent.mkdir(parents=True, exist_ok=True)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Translated {translated}/{min(start + batch_size, len(pending))}")

CACHE.parent.mkdir(parents=True, exist_ok=True)
CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Offline fallback accepted: {translated}/{len(pending)}")
