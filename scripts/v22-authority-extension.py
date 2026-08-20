#!/usr/bin/env python3
"""Schema-tolerant second pass for historical story-title group formats.

This pass exists because old generated files used several key conventions,
including parentTitleJa/parentTitleZh and Chinese field labels. It consumes the
primary V22 authority map, then applies the same source hierarchy to every title
pair it can identify without changing non-title prose.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
KANA = re.compile(r"[ぁ-ゖァ-ヺー]")
HAN = re.compile(r"[一-龯々〆ヶ]")
NO = re.compile(r"^\s*No\.\s*(\d+)\b", re.I)
DIGITS = re.compile(r"(?<!\d)(\d{3,8})(?!\d)")


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("〜", "~").replace("～", "~")
    text = re.sub(r"[\s\u3000\u00a0]+", "", text)
    text = re.sub(r"[「」『』【】\[\]()（）〈〉《》\"'`]+", "", text)
    return text.casefold().strip()


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value or "")).replace("\u3000", " ")).strip()


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def walk(data: Any, path: tuple[Any, ...] = ()) -> Iterator[tuple[tuple[Any, ...], Any]]:
    yield path, data
    if isinstance(data, dict):
        for key, value in data.items():
            yield from walk(value, path + (key,))
    elif isinstance(data, list):
        for index, value in enumerate(data):
            yield from walk(value, path + (index,))


def ascii_key(key: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).casefold())


def is_jp_key(key: Any) -> bool:
    raw = str(key)
    keyn = ascii_key(key)
    return (
        "日文" in raw or "原文" in raw or "日本語" in raw
        or keyn in {"ja", "jp", "jpn", "japanese", "original", "source"}
        or keyn.endswith(("ja", "jp", "jpn", "japanese"))
        or any(token in keyn for token in ("titleja", "titlejp", "nameja", "namejp", "japanesetitle", "originaltitle", "sourcetitle"))
    )


def is_zh_key(key: Any) -> bool:
    raw = str(key)
    keyn = ascii_key(key)
    return (
        "中文" in raw or "译文" in raw or "翻译" in raw or "汉化" in raw
        or keyn in {"zh", "cn", "zhcn", "chinese", "translation", "localized"}
        or keyn.endswith(("zh", "cn", "zhcn", "chinese"))
        or any(token in keyn for token in ("titlezh", "titlecn", "namezh", "namecn", "chinesetitle", "translatedtitle", "localizedtitle", "translation"))
    )


def is_titleish_key(key: Any) -> bool:
    raw = str(key)
    keyn = ascii_key(key)
    return "标题" in raw or "名称" in raw or any(token in keyn for token in ("title", "name", "label", "parent", "group"))


def valid_zh(value: Any) -> bool:
    text = compact(value)
    return bool(text) and not KANA.search(text) and (HAN.search(text) or re.search(r"[A-Za-z0-9]", text))


def all_dicts(data: Any) -> Iterator[dict[str, Any]]:
    for _, node in walk(data):
        if isinstance(node, dict):
            yield node


def ids(node: dict[str, Any], hint: str = "") -> list[str]:
    found: list[str] = []
    for key, value in node.items():
        keyn = ascii_key(key)
        if isinstance(value, (str, int)) and (keyn.endswith("id") or keyn in {"id", "key"}):
            found.extend(DIGITS.findall(str(value)))
        elif isinstance(value, str) and keyn in {"path", "file", "filename", "url", "slug"}:
            found.extend(DIGITS.findall(value))
    found.extend(DIGITS.findall(hint))
    return list(dict.fromkeys(found))


def pick_cn(node: dict[str, Any]) -> str | None:
    candidates: list[tuple[int, str]] = []
    for key, value in node.items():
        if not isinstance(value, str):
            continue
        text = compact(value)
        if not valid_zh(text) or len(text) > 180:
            continue
        keyn = ascii_key(key)
        score = 0
        if keyn in {"name", "title", "displayname", "sectionname", "chaptername", "eventname", "piecename", "charaname"}:
            score += 100
        if any(token in keyn for token in ("name", "title")):
            score += 50
        if "description" in keyn or "summary" in keyn:
            score -= 30
        candidates.append((score, text))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], -len(item[1])), reverse=True)
    return candidates[0][1]


def official_maps(libs: Path) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for kind, filename in {
        "piece": "pieceList.json", "chara": "charaList.json", "event": "eventList.json",
        "event_story": "eventStoryList.json", "chapter": "chapterList.json", "section": "sectionList.json",
    }.items():
        path = libs / filename
        mapping: dict[str, str] = {}
        if path.exists():
            data = load(path)
            for node in all_dicts(data):
                name = pick_cn(node)
                if not name:
                    continue
                for item_id in ids(node):
                    mapping.setdefault(item_id, name)
            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, str) and valid_zh(value):
                        for item_id in DIGITS.findall(str(key)):
                            mapping.setdefault(item_id, compact(value))
        result[kind] = mapping
    return result


def pair_map_from_tree(root: Path) -> tuple[dict[str, tuple[str, str]], dict[str, set[str]]]:
    pairs: dict[str, tuple[str, str]] = {}
    jp_ids: dict[str, set[str]] = collections.defaultdict(set)
    if not root.exists():
        return pairs, jp_ids
    for path in root.rglob("*.json"):
        if path.stat().st_size > 45_000_000:
            continue
        rel = path.relative_to(root).as_posix().casefold()
        if not any(token in rel for token in ("title", "story_index", "manifest", "localization", "translation")):
            continue
        try:
            data = load(path)
        except Exception:
            continue
        for node_path, node in walk(data):
            if not isinstance(node, dict):
                continue
            jp_values = [compact(value) for key, value in node.items() if isinstance(value, str) and is_jp_key(key)]
            zh_values = [compact(value) for key, value in node.items() if isinstance(value, str) and is_zh_key(key) and valid_zh(value)]
            node_ids = ids(node, "/".join(map(str, node_path)))
            for ja in jp_values:
                for item_id in node_ids:
                    jp_ids[norm(ja)].add(item_id)
                for zh in zh_values:
                    pairs.setdefault(norm(ja), (zh, path.relative_to(root).as_posix()))
            for key, value in node.items():
                if isinstance(key, str) and isinstance(value, str) and KANA.search(key) and valid_zh(value):
                    pairs.setdefault(norm(key), (compact(value), path.relative_to(root).as_posix()))
    return pairs, jp_ids


def target_existing_pairs(paths: list[Path]) -> dict[str, tuple[str, str]]:
    pairs: dict[str, tuple[str, str]] = {}
    for path in paths:
        try:
            data = load(path)
        except Exception:
            continue
        for _, node in walk(data):
            if not isinstance(node, dict):
                continue
            jps = [compact(value) for key, value in node.items() if isinstance(value, str) and is_jp_key(key)]
            zhs = [compact(value) for key, value in node.items() if isinstance(value, str) and is_zh_key(key) and valid_zh(value)]
            for ja in jps:
                for zh in zhs:
                    pairs.setdefault(norm(ja), (zh, path.relative_to(ROOT).as_posix()))
            for key, value in node.items():
                if isinstance(key, str) and isinstance(value, str) and KANA.search(key) and valid_zh(value):
                    pairs.setdefault(norm(key), (compact(value), path.relative_to(ROOT).as_posix()))
    return pairs


def infer_kinds(context: str) -> list[str]:
    text = context.casefold()
    result: list[str] = []
    if any(token in text for token in ("记忆结晶", "メモリア", "memoria", "piece")): result.append("piece")
    if any(token in text for token in ("魔法少女个人故事", "角色故事", "chara", "character", "キャラ")): result.append("chara")
    if any(token in text for token in ("活动", "event", "イベント")): result += ["event_story", "event"]
    if any(token in text for token in ("章节", "chapter", "章")): result.append("chapter")
    result += ["section", "event_story", "chara", "event", "chapter"]
    return list(dict.fromkeys(result))


def derive_zh_key(jp_key: str) -> str:
    raw = str(jp_key)
    replacements = [
        (r"Ja$", "Zh"), (r"JA$", "ZH"), (r"Jp$", "Zh"), (r"JP$", "ZH"),
        (r"_ja$", "_zh"), (r"_jp$", "_zh"), ("日文", "中文"), ("原文", "译文"),
    ]
    for source, target in replacements:
        updated = re.sub(source, target, raw)
        if updated != raw:
            return updated
    return "titleZh"


def natural_number(item: Any) -> int | None:
    if isinstance(item, str):
        match = NO.match(item)
        return int(match.group(1)) if match else None
    if isinstance(item, dict):
        for key, value in item.items():
            if isinstance(value, str) and (is_jp_key(key) or is_titleish_key(key)):
                match = NO.match(value)
                if match:
                    return int(match.group(1))
    return None


def apply_to_data(
    data: Any,
    file: Path,
    mapping: dict[str, tuple[str, str]],
    jp_ids: dict[str, set[str]],
    official: dict[str, dict[str, str]],
    authority: dict[str, dict[str, Any]],
    report: dict[str, Any],
    path: tuple[Any, ...] = (),
    inherited: str = "",
) -> None:
    if isinstance(data, dict):
        context_parts = [inherited]
        for key, value in data.items():
            if isinstance(value, (str, int)) and any(token in ascii_key(key) for token in ("category", "type", "kind", "group", "parent", "source")):
                context_parts.append(str(value))
        context = " | ".join(part for part in context_parts if part)
        jp_fields = [(key, value) for key, value in data.items() if isinstance(value, str) and is_jp_key(key)]
        zh_fields = [(key, value) for key, value in data.items() if isinstance(value, str) and is_zh_key(key)]
        node_ids = ids(data)
        for jp_key, ja in jp_fields:
            ja = compact(ja)
            if not ja:
                continue
            report["observed"] += 1
            selected: tuple[str, str] | None = None
            no_match = NO.match(ja)
            if no_match:
                item_id = str(1000 + int(no_match.group(1)))
                name = official.get("piece", {}).get(item_id)
                if name:
                    selected = (f"No.{int(no_match.group(1))} {name}", f"official:pieceList:{item_id}")
            if selected is None:
                candidate_ids = list(dict.fromkeys(node_ids + sorted(jp_ids.get(norm(ja), set()))))
                for kind in infer_kinds(context):
                    for item_id in candidate_ids:
                        name = official.get(kind, {}).get(item_id)
                        if name:
                            selected = (name, f"official:{kind}:{item_id}")
                            break
                    if selected: break
            if selected is None and norm(ja) in mapping:
                selected = mapping[norm(ja)]
            if selected is None and norm(ja) in authority:
                item = authority[norm(ja)]
                selected = (str(item.get("zh", "")), str(item.get("source", "authority-map")))
            if selected is None and not KANA.search(ja) and (HAN.search(ja) or re.search(r"[A-Za-z]", ja)):
                selected = (ja, "identity-preserved")

            if selected and valid_zh(selected[0]):
                target_key = zh_fields[0][0] if zh_fields else derive_zh_key(str(jp_key))
                before = data.get(target_key)
                if before != selected[0]:
                    data[target_key] = selected[0]
                    report["changed"] += 1
                    if len(report["changes"]) < 3000:
                        report["changes"].append({
                            "file": file.relative_to(ROOT).as_posix(), "path": "$" + ".".join(map(str, path)),
                            "ja": ja, "before": before, "after": selected[0], "source": selected[1],
                        })
                authority[norm(ja)] = {"ja": ja, "zh": selected[0], "source": selected[1]}
            else:
                report["unresolved"].setdefault(norm(ja), {
                    "ja": ja, "file": file.relative_to(ROOT).as_posix(), "path": "$" + ".".join(map(str, path)),
                })

        for key, value in list(data.items()):
            apply_to_data(value, file, mapping, jp_ids, official, authority, report, path + (key,), context)
    elif isinstance(data, list):
        for index, value in enumerate(data):
            apply_to_data(value, file, mapping, jp_ids, official, authority, report, path + (index,), inherited)
        numbers = [natural_number(item) for item in data]
        present = [item for item in numbers if item is not None]
        if len(present) >= 2 and len(present) >= len(data) * 0.7:
            data.sort(key=lambda item: (natural_number(item) is None, natural_number(item) if natural_number(item) is not None else 10**9))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--libs", required=True)
    parser.add_argument("--reader", required=True)
    args = parser.parse_args()
    libs = Path(args.libs)
    reader = Path(args.reader)

    targets = sorted({
        *PUBLIC.rglob("*story*title*.json"),
        *PUBLIC.rglob("*story_title*.json"),
        PUBLIC / "downloads" / "story-title-groups.json",
        PUBLIC / "data" / "story-title-groups-v1.json",
    })
    targets = [path for path in targets if path.exists() and path.stat().st_size <= 60_000_000]

    authority_path = PUBLIC / "data" / "story-title-authority-v22.json"
    authority_payload = load(authority_path) if authority_path.exists() else {"entries": []}
    authority = {norm(entry.get("ja")): dict(entry) for entry in authority_payload.get("entries", []) if isinstance(entry, dict) and entry.get("ja") and entry.get("zh")}

    mapping, jp_ids = pair_map_from_tree(reader)
    for key, value in target_existing_pairs(targets).items():
        mapping.setdefault(key, value)
    seed = ROOT / "data" / "wiki-authority-seed-v22.json"
    if seed.exists():
        for entry in load(seed).get("entries", []):
            if isinstance(entry, dict) and entry.get("ja") and valid_zh(entry.get("zh")):
                mapping.setdefault(norm(entry["ja"]), (compact(entry["zh"]), "wiki-fallback"))
    official = official_maps(libs)

    report: dict[str, Any] = {"observed": 0, "changed": 0, "changes": [], "unresolved": {}}
    for file in targets:
        data = load(file)
        before = json.dumps(data, ensure_ascii=False, sort_keys=True)
        apply_to_data(data, file, mapping, jp_ids, official, authority, report)
        after = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if before != after:
            write(file, data)

    entries = sorted(authority.values(), key=lambda entry: (norm(entry.get("ja")), str(entry.get("ja"))))
    authority_payload["entries"] = entries
    authority_payload["extensionPass"] = {
        "observed": report["observed"], "changed": report["changed"],
        "unresolved": len(report["unresolved"]),
    }
    write(authority_path, authority_payload)
    write(PUBLIC / "downloads" / "story-title-authority-v22.json", authority_payload)

    final_report = {
        "schemaVersion": 1,
        "targetFiles": [path.relative_to(ROOT).as_posix() for path in targets],
        "observed": report["observed"],
        "changed": report["changed"],
        "authorityEntries": len(entries),
        "officialCounts": {kind: len(values) for kind, values in official.items()},
        "readerPairs": len(mapping),
        "readerIdTitles": len(jp_ids),
        "unresolvedCount": len(report["unresolved"]),
        "unresolved": sorted(report["unresolved"].values(), key=lambda item: norm(item["ja"])),
        "sampleChanges": report["changes"][:1000],
    }
    write(ROOT / "reports" / "v22-title-group-extension.json", final_report)
    write(PUBLIC / "data" / "v22-title-group-extension.json", final_report)
    print(json.dumps({key: final_report[key] for key in ("observed", "changed", "authorityEntries", "unresolvedCount")}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
