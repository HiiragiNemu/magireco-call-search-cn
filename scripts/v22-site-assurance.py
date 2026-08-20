#!/usr/bin/env python3
"""Final V22 defect audit and low-risk static-site hardening.

The audit intentionally distinguishes release blockers from maintainability,
accessibility and performance findings. It may repair only deterministic HTML
metadata/security issues; it never invents translations or rewrites application
logic merely to reduce a warning count.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import html
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
REPORTS = ROOT / "reports"
BUILD = "v22-authority-20260820"
OBSOLETE_TITLE = "魔法纪录·Magia Exedra 魔法少女称呼搜索"
KANA = re.compile(r"[ぁ-ゖァ-ヺー]")
NO = re.compile(r"^\s*No\.\s*(\d+)\b", re.I)
SECRET = re.compile(
    r"(?i)(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)"
    r"\s*[:=]\s*[\"'][^\"'\n]{6,}[\"']"
)
DANGEROUS_JS = {
    "eval": re.compile(r"(?<![\w.])eval\s*\("),
    "new-function": re.compile(r"new\s+Function\s*\("),
    "document-write": re.compile(r"document\.write(?:ln)?\s*\("),
    "dynamic-inner-html": re.compile(r"\.innerHTML\s*=\s*(?![\"'`]<)")
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="strict")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


class DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[tuple[str, str]] = []
        self.target_blank_without_rel: list[str] = []
        self.images = 0
        self.images_without_alt = 0
        self.controls = 0
        self.unnamed_controls = 0
        self.html_lang = ""
        self.viewport = False
        self._labels_for: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag.lower() == "html":
            self.html_lang = values.get("lang", "")
        if tag.lower() == "meta" and values.get("name", "").lower() == "viewport":
            self.viewport = True
        if values.get("id"):
            self.ids.append(values["id"])
        if tag.lower() == "label" and values.get("for"):
            self._labels_for.add(values["for"])
        for key in ("src", "href", "poster"):
            if values.get(key):
                self.refs.append((key, values[key]))
        if tag.lower() == "a" and values.get("target", "").lower() == "_blank":
            rel_tokens = set(values.get("rel", "").lower().split())
            if not {"noopener", "noreferrer"}.issubset(rel_tokens):
                self.target_blank_without_rel.append(values.get("href", ""))
        if tag.lower() == "img":
            self.images += 1
            if "alt" not in values:
                self.images_without_alt += 1
        if tag.lower() in {"button", "input", "select", "textarea"}:
            input_type = values.get("type", "").lower()
            if input_type == "hidden":
                return
            self.controls += 1
            accessible = any(values.get(key) for key in ("aria-label", "aria-labelledby", "title"))
            if tag.lower() == "input" and input_type in {"submit", "reset", "button"}:
                accessible = accessible or bool(values.get("value"))
            if values.get("id") in self._labels_for:
                accessible = True
            if not accessible and tag.lower() != "button":
                self.unnamed_controls += 1


def safe_html_fixes(path: Path) -> dict[str, int]:
    text = read(path)
    original = text
    stats = {"lang": 0, "viewport": 0, "noopener": 0, "obsoleteTitle": 0}

    if re.search(r"<html\b", text, re.I):
        if re.search(r"<html\b[^>]*\blang\s*=", text, re.I):
            text, count = re.subn(
                r"(<html\b[^>]*\blang\s*=\s*[\"'])[^\"']*([\"'])",
                r"\1zh-CN\2", text, count=1, flags=re.I,
            )
            stats["lang"] += count
        else:
            text, count = re.subn(r"<html\b", '<html lang="zh-CN"', text, count=1, flags=re.I)
            stats["lang"] += count

    if not re.search(r"<meta\b[^>]*\bname\s*=\s*[\"']viewport[\"']", text, re.I):
        tag = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        text, count = re.subn(r"</head>", tag + "</head>", text, count=1, flags=re.I)
        stats["viewport"] += count

    # Add protection to literal target=_blank anchors without touching templated markup.
    def protect_anchor(match: re.Match[str]) -> str:
        tag = match.group(0)
        if re.search(r"\brel\s*=", tag, re.I):
            def extend_rel(rel_match: re.Match[str]) -> str:
                quote = rel_match.group(1)
                tokens = rel_match.group(2).split()
                for token in ("noopener", "noreferrer"):
                    if token not in tokens:
                        tokens.append(token)
                return f"rel={quote}{' '.join(tokens)}{quote}"
            return re.sub(r"\brel\s*=\s*([\"'])([^\"']*)\1", extend_rel, tag, count=1, flags=re.I)
        return tag[:-1] + ' rel="noopener noreferrer">'

    text, count = re.subn(r"<a\b(?=[^>]*\btarget\s*=\s*[\"']_blank[\"'])[^>]*>", protect_anchor, text, flags=re.I)
    stats["noopener"] += count

    # Remove only exact obsolete presentation nodes; the browser <title> is retained.
    pattern = re.compile(
        r"<(?P<tag>div|span|p|h1|h2|header|section)(?P<attrs>[^>]*)>\s*"
        r"魔法纪录\s*[·・]\s*Magia\s+Exedra\s+魔法少女称呼搜索\s*</(?P=tag)>",
        re.I | re.S,
    )
    text, count = pattern.subn("", text)
    stats["obsoleteTitle"] += count

    if text != original:
        write_text(path, text)
    return stats


def local_target(html_path: Path, ref: str) -> Path | None:
    ref = html.unescape(ref).strip()
    if not ref or ref.startswith(("#", "data:", "mailto:", "tel:", "javascript:", "blob:")):
        return None
    split = urlsplit(ref)
    if split.scheme or split.netloc or ref.startswith("//"):
        return None
    clean = unquote(split.path)
    if not clean or clean == "/":
        return PUBLIC / "index.html"
    target = PUBLIC / clean.lstrip("/") if clean.startswith("/") else html_path.parent / clean
    return target.resolve()


def classify_missing(target: Path) -> bool:
    if target.exists():
        return False
    # Extensionless routes are commonly handled by index.html or Cloudflare.
    if not target.suffix and (target / "index.html").exists():
        return False
    return True


def check_js_syntax(path: Path) -> tuple[bool, str]:
    if path.stat().st_size > 5 * 1024 * 1024:
        return True, "skipped-large-bundle"
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    return result.returncode == 0, (result.stderr or result.stdout).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix", action="store_true")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    blockers: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    fixes = collections.Counter()
    metrics = collections.Counter()

    if args.fix:
        for path in sorted(PUBLIC.rglob("*.html")):
            for key, value in safe_html_fixes(path).items():
                fixes[key] += value

    missing_refs: list[dict[str, str]] = []
    duplicate_ids: list[dict[str, Any]] = []
    accessibility: list[dict[str, Any]] = []
    obsolete_pages: list[str] = []
    insecure_http: list[dict[str, str]] = []

    for path in sorted(PUBLIC.rglob("*.html")):
        metrics["htmlFiles"] += 1
        text = read(path)
        parser_obj = DocumentParser()
        try:
            parser_obj.feed(text)
        except Exception as exc:
            blockers.append({"type": "invalid-html-parser-input", "file": rel(path), "error": str(exc)})
            continue
        duplicates = sorted(key for key, count in collections.Counter(parser_obj.ids).items() if key and count > 1)
        if duplicates:
            duplicate_ids.append({"file": rel(path), "ids": duplicates})
        visible_text = re.sub(r"<title\b[^>]*>.*?</title>", "", text, flags=re.I | re.S)
        visible_text = re.sub(r"<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>", "", visible_text, flags=re.I | re.S)
        visible_text = re.sub(r"<[^>]+>", " ", visible_text)
        if OBSOLETE_TITLE in re.sub(r"\s+", " ", html.unescape(visible_text)):
            obsolete_pages.append(rel(path))
        for _, ref_value in parser_obj.refs:
            if ref_value.lower().startswith("http://"):
                insecure_http.append({"file": rel(path), "ref": ref_value})
            target = local_target(path, ref_value)
            if target and classify_missing(target):
                try:
                    target.relative_to(PUBLIC.resolve())
                except ValueError:
                    continue
                missing_refs.append({"file": rel(path), "ref": ref_value})
        if not parser_obj.html_lang or not parser_obj.viewport or parser_obj.images_without_alt or parser_obj.unnamed_controls:
            accessibility.append({
                "file": rel(path),
                "lang": parser_obj.html_lang,
                "viewport": parser_obj.viewport,
                "images": parser_obj.images,
                "imagesWithoutAlt": parser_obj.images_without_alt,
                "controls": parser_obj.controls,
                "unnamedControls": parser_obj.unnamed_controls,
                "targetBlankWithoutRel": len(parser_obj.target_blank_without_rel),
            })

    if obsolete_pages:
        blockers.append({"type": "obsolete-visible-site-title", "files": obsolete_pages})
    if missing_refs:
        warnings.append({"type": "missing-local-resources", "count": len(missing_refs), "items": missing_refs[:1000]})
    if duplicate_ids:
        warnings.append({"type": "duplicate-html-ids", "count": len(duplicate_ids), "items": duplicate_ids[:500]})
    if accessibility:
        warnings.append({"type": "accessibility-inventory", "count": len(accessibility), "items": accessibility[:500]})
    if insecure_http:
        warnings.append({"type": "insecure-http-references", "count": len(insecure_http), "items": insecure_http[:500]})

    invalid_json: list[dict[str, str]] = []
    for path in sorted(ROOT.rglob("*.json")):
        if any(part in {".git", "node_modules", "_sources"} for part in path.parts):
            continue
        try:
            json.loads(read(path))
            metrics["jsonFiles"] += 1
        except Exception as exc:
            invalid_json.append({"file": rel(path), "error": str(exc)})
    if invalid_json:
        blockers.append({"type": "invalid-json", "count": len(invalid_json), "items": invalid_json})

    js_findings: list[dict[str, Any]] = []
    js_syntax_errors: list[dict[str, str]] = []
    for path in sorted(PUBLIC.rglob("*.js")):
        metrics["javascriptFiles"] += 1
        text = read(path)
        okay, detail = check_js_syntax(path)
        if not okay:
            js_syntax_errors.append({"file": rel(path), "error": detail})
        hits: list[str] = []
        if SECRET.search(text):
            hits.append("possible-hardcoded-secret")
        for name, pattern in DANGEROUS_JS.items():
            if pattern.search(text):
                hits.append(name)
        if hits:
            js_findings.append({"file": rel(path), "findings": hits})
    if js_syntax_errors:
        blockers.append({"type": "javascript-syntax-error", "count": len(js_syntax_errors), "items": js_syntax_errors})
    if js_findings:
        warnings.append({"type": "javascript-security-review", "count": len(js_findings), "items": js_findings})

    authority_path = PUBLIC / "data" / "story-title-authority-v22.json"
    title_metrics: dict[str, Any] = {}
    if not authority_path.exists():
        blockers.append({"type": "missing-authority-map", "file": rel(authority_path)})
    else:
        payload = json.loads(read(authority_path))
        entries = payload.get("entries", []) if isinstance(payload, dict) else []
        metrics["authorityEntries"] = len(entries)
        key_counts = collections.Counter()
        source_counts = collections.Counter()
        kana_values: list[dict[str, Any]] = []
        empty_values: list[dict[str, Any]] = []
        duplicate_keys: list[str] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            ja = str(entry.get("ja", "")).strip()
            zh = str(entry.get("zh", "")).strip()
            normalized = re.sub(r"\s+", "", ja).casefold()
            key_counts[normalized] += 1
            source_counts[str(entry.get("source", "unknown"))] += 1
            if not ja or not zh:
                empty_values.append(entry)
            if KANA.search(zh):
                kana_values.append(entry)
        duplicate_keys = sorted(key for key, count in key_counts.items() if key and count > 1)
        if kana_values:
            blockers.append({"type": "kana-in-chinese-authority-values", "count": len(kana_values), "items": kana_values[:200]})
        if empty_values:
            blockers.append({"type": "empty-authority-values", "count": len(empty_values), "items": empty_values[:200]})
        if duplicate_keys:
            warnings.append({"type": "duplicate-authority-keys", "count": len(duplicate_keys), "items": duplicate_keys[:500]})
        title_metrics = {"sourceCounts": dict(source_counts.most_common()), "duplicateKeys": len(duplicate_keys)}

    required_index = PUBLIC / "index.html"
    if not required_index.exists():
        blockers.append({"type": "missing-index"})
    else:
        index_text = read(required_index)
        for marker in (BUILD, "/myfile/v22-final.css", "/myfile/v22-final.js"):
            if marker not in index_text:
                blockers.append({"type": "missing-index-v22-marker", "marker": marker})

    css_path = PUBLIC / "myfile" / "v22-final.css"
    js_path = PUBLIC / "myfile" / "v22-final.js"
    if not css_path.exists() or not js_path.exists():
        blockers.append({"type": "missing-v22-runtime-assets"})
    else:
        css = read(css_path)
        runtime = read(js_path)
        for marker in ("width: max-content", "overflow-y: auto", "navtext-container"):
            if marker not in css:
                blockers.append({"type": "missing-menu-css-safeguard", "marker": marker})
        for marker in ("unlockDocument", "removeObsoleteHeading", "reorderNumericNoRows"):
            if marker not in runtime:
                blockers.append({"type": "missing-menu-runtime-safeguard", "marker": marker})

    workflow_branch_refs: list[dict[str, str]] = []
    workflow_dir = ROOT / ".github" / "workflows"
    if workflow_dir.exists():
        for path in sorted(workflow_dir.glob("*.y*ml")):
            text = read(path)
            for branch in ("safe-v18-production-fix", "safe-v20-production-fix", "v16-delivery-source-final"):
                if branch in text:
                    workflow_branch_refs.append({"file": rel(path), "branch": branch})
    if workflow_branch_refs:
        blockers.append({"type": "active-workflow-obsolete-branch-reference", "items": workflow_branch_refs})

    tracked_node_modules = False
    result = subprocess.run(["git", "ls-files", "node_modules"], capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip():
        tracked_node_modules = True
        blockers.append({"type": "tracked-node-modules", "sample": result.stdout.splitlines()[:100]})

    large_files: list[dict[str, Any]] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in {".git", "node_modules", "_sources"} for part in path.parts):
            continue
        size = path.stat().st_size
        if size >= 5 * 1024 * 1024:
            large_files.append({"file": rel(path), "bytes": size})
    if large_files:
        warnings.append({"type": "large-static-files", "count": len(large_files), "items": sorted(large_files, key=lambda item: item["bytes"], reverse=True)[:300]})

    report = {
        "schemaVersion": 1,
        "build": BUILD,
        "generatedAt": now(),
        "state": "pass" if not blockers else "fail",
        "blockerCount": len(blockers),
        "warningCount": len(warnings),
        "blockers": blockers,
        "warnings": warnings,
        "metrics": dict(metrics),
        "titleMetrics": title_metrics,
        "fixes": dict(fixes),
        "policy": {
            "branchDeletionExecuted": False,
            "latinCanonicalNamesMayRemain": True,
            "unchangedSharedHanTitlesMayRemain": True,
            "unresolvedTitlesAreReportedInsteadOfFabricated": True,
        },
    }
    write_json(REPORTS / "v22-defect-audit.json", report)
    write_json(PUBLIC / "data" / "v22-defect-audit.json", report)

    md = [
        "# V22 网站缺陷审计", "", f"- 状态：**{report['state']}**",
        f"- 阻断项：{len(blockers)}", f"- 警告项：{len(warnings)}",
        f"- HTML 文件：{metrics['htmlFiles']}", f"- JSON 文件：{metrics['jsonFiles']}",
        f"- JavaScript 文件：{metrics['javascriptFiles']}", f"- 权威译名：{metrics['authorityEntries']}", "",
        "## 阻断项", "",
    ]
    md.extend([f"- `{item['type']}`" for item in blockers] or ["- 无"])
    md += ["", "## 非阻断调查结果", ""]
    md.extend([f"- `{item['type']}`：{item.get('count', '见 JSON 详情')}" for item in warnings] or ["- 无"])
    md += ["", "分支删除未执行；该项按本轮用户要求排除。", ""]
    write_text(REPORTS / "v22-defect-audit.md", "\n".join(md))

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.strict and blockers:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
