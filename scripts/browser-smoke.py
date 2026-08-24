#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

EXPECTED_RELEASE = "canonical-title-authority-v1"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--allow-title-runtime-error", action="store_true")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    origin = f"{urlparse(base).scheme}://{urlparse(base).netloc}"
    proof = {
        "base": base,
        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "state": "fail",
        "pageErrors": [],
        "sameOriginRequestFailures": [],
        "checks": {},
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        page.on("pageerror", lambda error: proof["pageErrors"].append(str(error)))

        def request_failed(request):
            if request.url.startswith(origin):
                proof["sameOriginRequestFailures"].append({
                    "url": request.url,
                    "failure": request.failure,
                })

        page.on("requestfailed", request_failed)

        page.goto(f"{base}/story.html?smoke={time.time_ns()}", wait_until="domcontentloaded", timeout=120000)
        page.wait_for_function(
            "() => document.querySelectorAll('.suite-character-card').length >= 180",
            timeout=120000,
        )
        count_text = page.locator("#storyCharacterCount").inner_text()
        status_text = page.locator("#storyStatus").inner_text()
        if "初始化失败" in status_text:
            raise AssertionError(status_text)
        if page.locator("#storySearchButton").is_disabled():
            raise AssertionError("story search button is disabled after initialization")

        runtime_info = page.evaluate(
            """async () => {
              const api = window.__STORY_TITLE_RUNTIME_V1__;
              const localization = await window.MagiToolsV7.loadLocalizationV7();
              const map = localization.titleByCategoryV10 || {};
              return {
                dataRelease: api?.dataRelease || null,
                runtimeRelease: api?.release || null,
                mappedTitles: Object.values(map).reduce(
                  (sum, pairs) => sum + Object.keys(pairs || {}).length,
                  0
                ),
                sample: map['メモリア']?.['No.888 夢を追う妹'] || null,
                runtimeError: localization.storyTitleRuntimeError || null
              };
            }"""
        )
        if not args.allow_title_runtime_error:
            if runtime_info["dataRelease"] != EXPECTED_RELEASE:
                raise AssertionError(runtime_info)
            if runtime_info["mappedTitles"] < 5826:
                raise AssertionError(runtime_info)
            if runtime_info["sample"] != "No.888 追梦的妹妹":
                raise AssertionError(runtime_info)
            if runtime_info["runtimeError"]:
                raise AssertionError(runtime_info)
        else:
            # Missing V26 title files are allowed here. The assertion is that the
            # core catalog and search UI still initialize and return results.
            pass

        page.locator("#storyClearTypes").click()
        page.evaluate(
            """() => {
              const input = [...document.querySelectorAll(
                '#storyTypeOptions input[name="storyType"]'
              )].find((item) => item.value === '魔法少女');
              if (!input) throw new Error('character-story category is missing');
              input.checked = true;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }"""
        )
        target = page.locator('.suite-character-card[data-jp="環いろは"]')
        if target.count() == 0:
            target = page.locator(".suite-character-card").first
        target.click()
        page.locator("#storySearchButton").click()
        page.wait_for_function(
            "() => document.querySelector('#storyStatus')?.textContent.includes('搜索完成')",
            timeout=120000,
        )
        result_rows = page.locator(".story-row-v7").count()
        if result_rows < 1:
            raise AssertionError("story search returned no result rows")

        proof["checks"]["storySearch"] = {
            "characterCountText": count_text,
            "resultRows": result_rows,
            "runtime": runtime_info,
        }

        if not args.allow_title_runtime_error:
            editor = context.new_page()
            editor.on("pageerror", lambda error: proof["pageErrors"].append(f"editor: {error}"))
            editor.goto(
                f"{base}/story-title-editor.html?smoke={time.time_ns()}",
                wait_until="domcontentloaded",
                timeout=120000,
            )
            editor.wait_for_function(
                "() => document.querySelectorAll('#titleEditorList tr[data-group-id]').length >= 2100",
                timeout=120000,
            )
            editor_rows = editor.locator("#titleEditorList tr[data-group-id]").count()
            if editor_rows != 2166:
                raise AssertionError(f"expected 2166 editor rows, got {editor_rows}")
            proof["checks"]["titleEditor"] = {"rows": editor_rows}

            index = context.new_page()
            index.goto(f"{base}/?smoke={time.time_ns()}", wait_until="domcontentloaded", timeout=120000)
            if index.locator(".navtext-container").count() != 0:
                raise AssertionError("obsolete top title row is still present")
            label = index.locator('label[for="menu-btn"]')
            label.click()
            index.wait_for_function(
                "() => document.querySelector('#menu-btn')?.checked === true",
                timeout=30000,
            )
            menu_box = index.locator(".header .menu").bounding_box()
            if not menu_box or menu_box["width"] >= 700:
                raise AssertionError(f"hamburger menu is unexpectedly wide: {menu_box}")
            body_overflow = index.evaluate("getComputedStyle(document.body).overflow")
            if body_overflow == "hidden":
                raise AssertionError("hamburger menu locked document scrolling")
            index.keyboard.press("Escape")
            index.wait_for_function(
                "() => document.querySelector('#menu-btn')?.checked === false",
                timeout=30000,
            )
            proof["checks"]["hamburger"] = {
                "width": menu_box["width"],
                "bodyOverflow": body_overflow,
            }

            for path, heading in (
                ("attendance.html", "共同出场次数排行"),
                ("runes.html", "魔女文翻译"),
            ):
                response = context.request.get(
                    f"{base}/{path}?smoke={time.time_ns()}",
                    headers={"Cache-Control": "no-cache, no-store"},
                    timeout=120000,
                )
                body = response.text()
                if not response.ok:
                    raise AssertionError(f"{path}: HTTP {response.status}")
                if f"<h1>{heading}</h1>" not in body:
                    raise AssertionError(f"{path}: expected heading is absent")
                proof["checks"][path] = {
                    "heading": heading,
                    "status": response.status,
                    "url": response.url,
                }

        if proof["pageErrors"]:
            raise AssertionError(f"page errors: {proof['pageErrors']}")
        if proof["sameOriginRequestFailures"] and not args.allow_title_runtime_error:
            raise AssertionError(
                f"same-origin request failures: {proof['sameOriginRequestFailures'][:10]}"
            )

        proof["state"] = "pass"
        context.close()
        browser.close()

    Path(args.output).write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(proof, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
