"""カード毎のカスタム情報をWiki HTMLから抽出

各カードブロックの「カスタム」セクションには、カスタム種類(列) × 段階(行) のマトリクスがある:
- N (rowspan=6) / Leg (rowspan=3): カスタム不可
- R (rowspan=11): 3段階まで
- SR (rowspan=10): 2段階まで
- SSR (rowspan=9): 1段階のみ

種類は最大 3 列 (空欄は "--")。
各セル: (消費P, 効果テキスト)

出力スキーマ (customizations.yaml と互換):
    com_X:
      custom_limit: 1..3
      options:
        - id: <slug>
          label: 種類名 + 効果概要
          type: toggle | counter
          max: int (counter のみ)
          apply: { 機械的フィールド }
          effect_texts: ["1段階: ...", "2段階: ...", "3段階: ..."]
"""
from __future__ import annotations

import re
from typing import Iterable

from bs4 import Tag


# 「種類」セルが空 (--) のスキップ用マーカー
_EMPTY_MARKERS = ("", "--", "ー", "—")


def _row_first_text(row: Tag) -> str:
    cells = row.find_all(["td", "th"])
    if not cells:
        return ""
    return cells[0].get_text(strip=True).replace("\n", "")


def _is_custom_header_row(row: Tag) -> bool:
    """カスタムセクション先頭の <th rowspan=N>カスタム</th> 行を判定"""
    cells = row.find_all(["td", "th"])
    if not cells:
        return False
    first = cells[0]
    if first.name != "th" or not first.get("rowspan"):
        return False
    text = first.get_text(strip=True).replace("\n", "")
    return text == "カスタム"


def _is_stage_data_row(row: Tag) -> tuple[int, list[Tag]] | None:
    """1段階 / 2段階 / 3段階 行を判定して (段階番号, データセル列) を返す"""
    cells = row.find_all(["td", "th"])
    if len(cells) < 2:
        return None
    first_text = cells[0].get_text(strip=True).replace("\n", "")
    m = re.match(r"(\d)段階", first_text)
    if not m:
        return None
    return int(m.group(1)), cells[1:]


def _normalize_text(s: str) -> str:
    """効果テキストを表示しやすく整形。
    日本語の長音記号「ー」は他の語の一部 (パラメータ など) として保持する。
    マイナス記号としての全角ハイフン類のみ ASCII '-' に統一。"""
    s = re.sub(r"\s+", " ", s).strip()
    # 数字や0前の文脈での全角マイナス相当のみ変換 (ー は触らない)
    return s.replace("−", "-").replace("ｰ", "-").replace("―", "-")


def parse_customization(block: list[Tag]) -> dict | None:
    """1カードブロックの行リストから カスタム情報を抽出。

    Returns:
        {
          custom_limit: int (記載が "対象外" のとき 0),
          options: [
            { id, label, type, max?, apply, effect_texts: [...] }
          ]
        }
        カスタム無しなら None
    """
    # custom_limit を block[0] から取得
    head_cells = block[0].find_all(["td", "th"])
    custom_limit = 0
    head_text = " ".join(c.get_text(" ", strip=True) for c in head_cells)
    m = re.search(r"カスタム上限\s*([対象外0-9]+)", head_text)
    if m:
        v = m.group(1)
        if v == "対象外":
            custom_limit = 0
        else:
            try:
                custom_limit = int(v)
            except ValueError:
                pass

    # カスタムヘッダ行を探す
    custom_header_idx = None
    for i, row in enumerate(block):
        if _is_custom_header_row(row):
            custom_header_idx = i
            break
    if custom_header_idx is None:
        return None

    # ヘッダ行の セル: <thrN>カスタム<th>種類<th c2>TypeA<th c2>TypeB<th c2>TypeC<th>編集
    header_cells = block[custom_header_idx].find_all(["td", "th"])
    type_names: list[str] = []
    # cells[0] = "カスタム" (rowspan), [1] = "種類", 末尾 = "編集"
    for c in header_cells[2:-1]:
        t = c.get_text(strip=True)
        if t and t not in _EMPTY_MARKERS:
            type_names.append(t)
        else:
            type_names.append("")  # 空 ("--") の列も位置維持のため記録

    # 段階データ行を集める (段階番号 → [(p_cost_text, effect_text), ...])
    stages_data: dict[int, list[tuple[str, str]]] = {}
    for row in block[custom_header_idx + 2 :]:
        result = _is_stage_data_row(row)
        if not result:
            # 段階データ行で終わり (次のカード or 末尾)
            continue
        stage_num, data_cells = result
        # data_cells: [p_cost, effect] × N types, [編集]
        per_type: list[tuple[str, str]] = []
        i = 0
        for _ in range(len(type_names)):
            if i + 1 >= len(data_cells):
                break
            p_cost_text = _normalize_text(data_cells[i].get_text(strip=True))
            effect_text = _normalize_text(data_cells[i + 1].get_text(" ", strip=True))
            per_type.append((p_cost_text, effect_text))
            i += 2
        stages_data[stage_num] = per_type

    if not type_names or not stages_data:
        return None

    # 各 type について options を構築
    options: list[dict] = []
    for idx, type_name in enumerate(type_names):
        if not type_name:
            continue  # 空列はスキップ

        # この種類の有効な段階 (p_cost が "--" でない) を抽出
        stage_entries: list[dict] = []
        for stage_num in sorted(stages_data.keys()):
            per_type = stages_data[stage_num]
            if idx >= len(per_type):
                continue
            p_cost, effect = per_type[idx]
            if p_cost in _EMPTY_MARKERS:
                continue
            # 数字に変換可能なら
            try:
                p_cost_n = int(re.sub(r"\D", "", p_cost) or "0")
            except ValueError:
                p_cost_n = 0
            stage_entries.append(
                {"stage": stage_num, "p_cost": p_cost_n, "effect": effect}
            )

        if not stage_entries:
            continue

        # 機械的効果のマッピング (適用可能なら)
        apply_data, opt_type = _classify(type_name, stage_entries)

        max_stage = max(s["stage"] for s in stage_entries)
        effect_texts = [f"{s['stage']}段階: {s['effect']} (P{s['p_cost']})" for s in stage_entries]

        opt: dict = {
            "id": _slugify(type_name),
            "label": type_name,
            "type": opt_type,
            "apply": apply_data,
            "effect_texts": effect_texts,
        }
        if opt_type == "counter":
            opt["max"] = max_stage
        options.append(opt)

    if not options:
        return None
    return {"custom_limit": custom_limit, "options": options}


def _slugify(name: str) -> str:
    """種類名から ID slug を作成 (英数化は難しいので原文+簡略化)"""
    s = name.strip()
    s = s.replace(" ", "_")
    return s


# 効果テキスト → 機械的フィールドのマッピング
# 単純化のため: 種類名 と 1段階目の効果テキストから推測
def _classify(type_name: str, stage_entries: list[dict]) -> tuple[dict, str]:
    """(apply dict, type: toggle|counter) を返す。
    マッピング不能な種類は apply={} (機械効果なし) として表示のみ。"""
    # まず toggle 系 (1段階のみ・固定効果)
    if "レッスン中1回の制限削除" in type_name:
        return ({"noExile": True}, "toggle")
    if "全力値コスト値" in type_name:
        return ({"removeFullPowerCost": True}, "toggle")
    if "体力消費コスト値" in type_name or type_name == "コスト値-":
        # HP コスト削減: 段階 1/2/3 で -1/-2/-3 (推定)
        # 多くの場合段階別の効果数値があるので counter で hpCostReduction
        if len(stage_entries) > 1:
            return ({"hpCostReductionPer": 1}, "counter")
        return ({"removeHpCost": True}, "toggle")

    # 成長追加: パラメータ上昇回数バフ
    if "成長追加" in type_name or "パラメータ上昇回数" in type_name:
        return ({"paramRepeatBonusPer": 1}, "counter")

    # 開始時手札に入る: 引き運に影響するが v1 simulator では未対応
    # (初期手札保証なので、ユーザーが手札に追加すれば再現可能)
    # → 表示のみ
    if "開始時手札" in type_name:
        return ({}, "toggle")

    # それ以外 (パラメータ+、元気追加、集中+、好印象+ など多数) は機械効果未対応
    # 表示のみで複数段階なら counter、1段階なら toggle
    if len(stage_entries) > 1:
        return ({}, "counter")
    return ({}, "toggle")


# ============= 統合: 全カード から customizations.yaml を生成 =============


def build_customizations_dict(
    parsed_blocks: Iterable[tuple[str, list[Tag]]],
) -> dict:
    """parsed_blocks: [(card_id, block_rows)]. customizations dict を構築"""
    out: dict[str, dict] = {}
    for card_id, block in parsed_blocks:
        cust = parse_customization(block)
        if cust:
            out[card_id] = cust
    return {"customizations": out}
