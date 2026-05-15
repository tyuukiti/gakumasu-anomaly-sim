"""WikiCard → YAML向け dict 変換"""
from __future__ import annotations

from .effect_parser import parse_cost, parse_effect_text, parse_growth
from .parsers import WikiCard

# Wiki type_text → 内部 type
_TYPE_MAP = {
    "アクティブ": "active",
    "メンタル": "mental",
    "トラブル": "trouble",
}


def detect_usage(remark: str) -> str:
    """備考テキストから使用回数ルールを判定。
    - "レッスン中1回" を含む → once_per_lesson (使用後は除外、デッキ復帰しない)
    - それ以外 → reusable (使用後は捨て札へ。デッキ枯渇時に再シャッフル)
    """
    if "レッスン中1回" in remark:
        return "once_per_lesson"
    return "reusable"


def build_card(card: WikiCard) -> dict:
    """1 WikiCard を YAML エントリ dict に変換。
    強化4段階 (無印 / + / ++ / +++) すべてを保存し、UIから選択可能にする。
    """
    variants_out: list[dict] = []
    unparsed_all: list[str] = []
    for v in card.variants:
        effects, unparsed = parse_effect_text(v.effect_lines)
        cost = parse_cost(v.cost_text)
        # 成長効果を [成長] 行から別途抽出
        growth = parse_growth(v.effect_lines)
        # effects は ParsedEffect → dict 化
        eff_dicts = []
        for e in effects:
            d: dict = {"kind": e.kind}
            if e.value is not None:
                d["value"] = e.value
            if e.note:
                d["note"] = e.note
            eff_dicts.append(d)
        variant_out: dict = {
            "level": v.level,           # 無印 / + / ++ / +++
            "cost": cost,               # {"hp": N} or {"full_power": N} or {} or {"raw": ...}
            "effects": eff_dicts,
            "raw_effect_text": " / ".join(v.effect_lines),
        }
        if growth:
            variant_out["growth"] = growth
        if unparsed:
            variant_out["unparsed_lines"] = unparsed
        variants_out.append(variant_out)
        unparsed_all.extend(unparsed)

    out = {
        "id": card.wiki_id,
        "name": card.name,
        "category": card.category,
        "rarity": card.rarity,
        "type": _TYPE_MAP.get(card.type_text, "unknown"),
        "custom_limit": card.custom_limit_text,
        "remark": card.remark_text,
        "usage": detect_usage(card.remark_text),
        "variants": variants_out,
        # 自動抽出失敗時の補正対象フラグ (どの強化でも何も拾えなかった場合)
        "_needs_review": not any(v["effects"] for v in variants_out),
    }
    if card.owner:
        out["owner"] = card.owner
    return out
