"""アノマリーモード Wiki スクレイパー エントリポイント

使い方:
    python scripts/sync_anomaly_wiki.py            # フリー/アノマリー/トラブル を取得
    python scripts/sync_anomaly_wiki.py --validate # 自動抽出に失敗したカードを表示
    python scripts/sync_anomaly_wiki.py --cache    # 取得済みHTMLを再利用 (tmp/skill_list.html)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# パッケージインポート (スクリプト直起動でも動作させるため sys.path 調整)
sys.path.insert(0, str(Path(__file__).parent))

from anomaly_sync.card_builder import build_card  # noqa: E402
from anomaly_sync.constants import (              # noqa: E402
    CATEGORY_OUTPUT_FILES,
    CATEGORY_PREFIX_MAP,
    DATA_DIR,
    SKILL_LIST_URL,
)
from anomaly_sync.customization_parser import parse_customization  # noqa: E402
from anomaly_sync.effect_parser import parse_growth  # noqa: E402
from anomaly_sync.network import fetch_page       # noqa: E402
from anomaly_sync.parsers import (  # noqa: E402
    parse_skill_card_page,
    parse_pidol_section,
    parse_sp_section,
)
from anomaly_sync.yaml_io import (                # noqa: E402
    load_overrides,
    merge_overrides,
    save_cards_yaml,
)
import yaml as _yaml  # noqa: E402

CACHE_FILE = Path(__file__).parent.parent / "tmp" / "skill_list.html"


def main() -> int:
    parser = argparse.ArgumentParser(description="アノマリーモード Wiki スクレイパー")
    parser.add_argument("--validate", action="store_true", help="自動抽出に失敗したカード一覧を表示して終了")
    parser.add_argument(
        "--cache",
        action="store_true",
        help=f"既存の {CACHE_FILE} を使用 (ネットワーク取得をスキップ)",
    )
    args = parser.parse_args()

    # ---- HTML取得 ----
    if args.cache and CACHE_FILE.exists():
        print(f"[cache] {CACHE_FILE}")
        html = CACHE_FILE.read_text(encoding="utf-8")
    else:
        print(f"[fetch] {SKILL_LIST_URL}")
        html = fetch_page(SKILL_LIST_URL)
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(html, encoding="utf-8")
        print(f"  → cached to {CACHE_FILE} ({len(html):,} chars)")

    # ---- パース ----
    target_prefixes = list(CATEGORY_PREFIX_MAP.keys())  # ['F', 'A', 'T']
    parsed = parse_skill_card_page(html, target_prefixes)

    # ---- overrides 読込 ----
    overrides_file = DATA_DIR / "overrides.yaml"
    overrides = load_overrides(overrides_file)
    if overrides:
        print(f"[overrides] {len(overrides)} entries loaded from {overrides_file.name}")

    # ---- P-Idol 固有カードも抽出 ----
    pidol_cards = parse_pidol_section(html)
    # ---- サポートイベント固有スキル (IDなし) も抽出 ----
    sp_cards = parse_sp_section(html)
    print(f"[pidol] {len(pidol_cards)} char-unique + {len(sp_cards)} support-unique cards detected")
    pidol_cards = pidol_cards + sp_cards

    # ---- カテゴリ別にYAML出力 ----
    needs_review: list[str] = []
    summary: dict[str, int] = {}
    all_customizations: dict[str, dict] = {}

    # com_* カテゴリ群 + P-Idol を順番に処理
    category_card_lists: list[tuple[str, list]] = []
    for prefix in target_prefixes:
        cat_name = CATEGORY_PREFIX_MAP[prefix]
        category_card_lists.append((cat_name, parsed.get(prefix, [])))
    if pidol_cards:
        category_card_lists.append(("pidol", pidol_cards))

    for cat_name, wiki_cards in category_card_lists:
        cards_out = []
        for wc in wiki_cards:
            d = build_card(wc)
            d = merge_overrides(d, overrides)
            if d.get("_needs_review"):
                needs_review.append(f"{d['id']} | {d['name']}")
            cards_out.append(d)

            # カスタム情報を抽出 (raw_block があれば)
            if wc.raw_block:
                cust = parse_customization(wc.raw_block)
                if cust:
                    all_customizations[wc.wiki_id] = cust

            # 成長効果を持つカードには "成長スタック" の合成オプションを追加
            best_growth = None
            for v in wc.variants:
                g = parse_growth(v.effect_lines)
                if g and (best_growth is None or g["max_count"] > best_growth["max_count"]):
                    best_growth = g
            if best_growth:
                pf = best_growth["per_fire"]
                apply_d: dict = {}
                if pf.get("paramRepeatBonus"):
                    apply_d["paramRepeatBonusPer"] = pf["paramRepeatBonus"]
                if pf.get("hpCostReduction"):
                    apply_d["hpCostReductionPer"] = pf["hpCostReduction"]
                # paramValueIncrease は v1 未対応 (表示のみ)
                effect_desc_parts = []
                if pf.get("paramRepeatBonus"):
                    effect_desc_parts.append(f"パラメータ上昇回数+{pf['paramRepeatBonus']}")
                if pf.get("hpCostReduction"):
                    effect_desc_parts.append(f"体力消費-{pf['hpCostReduction']}")
                if pf.get("paramValueIncrease"):
                    effect_desc_parts.append(f"パラメータ値増加+{pf['paramValueIncrease']}")
                effect_desc = "・".join(effect_desc_parts) or "未解析"
                growth_opt = {
                    "id": "成長スタック",
                    "label": "成長スタック (カード固有 [成長] 効果)",
                    "type": "counter",
                    "max": best_growth["max_count"],
                    "apply": apply_d,
                    "effect_texts": [
                        f"1スタックごと: {effect_desc} (上限 {best_growth['max_count']} 回)"
                    ],
                }
                entry = all_customizations.setdefault(
                    wc.wiki_id, {"custom_limit": 0, "options": []}
                )
                entry["options"].insert(0, growth_opt)

        filepath = DATA_DIR / CATEGORY_OUTPUT_FILES[cat_name]
        if args.validate:
            # validate モードでは書き込まない (副作用なし)
            summary[cat_name] = len(cards_out)
        else:
            save_cards_yaml(cards_out, filepath)
            summary[cat_name] = len(cards_out)
            print(f"[write] {filepath.relative_to(DATA_DIR.parent.parent)} ({len(cards_out)} cards)")

    # ---- customizations.yaml の生成 ----
    if not args.validate and all_customizations:
        cust_path = DATA_DIR / "customizations.yaml"
        text = _yaml.safe_dump(
            {"customizations": all_customizations},
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
            width=200,
        )
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
        cust_path.write_bytes(text.encode("utf-8"))
        print(f"[write] {cust_path.relative_to(DATA_DIR.parent.parent)} ({len(all_customizations)} cards with customizations)")

    # ---- サマリ ----
    print()
    print("=" * 50)
    print("Summary:")
    for cat, n in summary.items():
        print(f"  {cat:>10s}: {n:3d} cards")

    if needs_review:
        print()
        print(f"⚠ 自動抽出に失敗 / レビュー要 ({len(needs_review)} cards):")
        for line in needs_review:
            print(f"  - {line}")
        if args.validate:
            return 1
    elif args.validate:
        print()
        print("✓ 全カードが自動抽出に成功")
    return 0


if __name__ == "__main__":
    sys.exit(main())
