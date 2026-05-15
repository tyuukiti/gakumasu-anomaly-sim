"""カード効果テキストの構造化パース

入力: 1強化レベル分の effect_lines (例: ["強気2段階目に変更", "パラメータ+12"])
出力: ParsedEffect のリスト + cost (HP消費)

スコア計算に必要な数値系効果を最大限抽出し、解釈不能な行は raw として保存。
overrides.yaml で手動補正可能にする方針。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ======== 数値系効果の正規表現 ========
# 単純な「キーワード+N」「N枚引く」等にマッチ。複合条件は別途。

# 正規表現は順序依存 (具体的なものを先に)
# パラメータ+N または パラメータ+N（M回） を捕捉 (M=回数、デフォルト1)
_PARAM_RE = re.compile(r"パラメータ\s*\+\s*(\d+)(?:\s*[（(]\s*(\d+)\s*回\s*[）)])?")
_GOOD_IMPRESSION_RE = re.compile(r"好印象\s*\+\s*(\d+)")
_GOOD_IMPRESSION_TURNS_RE = re.compile(r"好印象\s*(\d+)\s*ターン")
_GOOD_CONDITION_RE = re.compile(r"(?<!絶)好調\s*(\d+)\s*ターン")
_GREAT_CONDITION_RE = re.compile(r"絶好調\s*(\d+)\s*ターン")
_MOTIVATION_RE = re.compile(r"やる気\s*\+\s*(\d+)")
_CONCENTRATION_RE = re.compile(r"集中\s*\+\s*(\d+)")
_GENKI_RE = re.compile(r"元気\s*\+\s*(\d+)")
_HP_RECOVER_RE = re.compile(r"体力\s*\+\s*(\d+)")
_HP_DAMAGE_RE = re.compile(r"体力\s*-\s*(\d+)")
_HP_DAMAGE_KW_RE = re.compile(r"体力消費\s*(\d+)")
_DRAW_RE = re.compile(r"(?:スキル)?カードを?\s*(\d+)\s*枚?\s*引く")
_DISCARD_ALL_RE = re.compile(r"手札を全て?捨てる")
# 「手札をすべて入れ替える」「手札を全て入れ替える」も実ゲームでは手札を捨てて引き直すので
# discard_all 相当 (draw 枚数はカード側に別途記載される)
_HAND_REPLACE_RE = re.compile(r"手札を(?:すべて|全て)入れ替える")
_DISCARD_N_RE = re.compile(r"手札[をから]?\s*(\d+)\s*枚?\s*捨てる")
_FULL_POWER_RE = re.compile(r"全力値\s*\+\s*(\d+)")
_PASSION_ADD_RE = re.compile(r"熱意追加\s*\+\s*(\d+)")
_PASSION_BONUS_PCT_RE = re.compile(r"熱意増加\s*\+\s*(\d+)\s*%?")
_PARAM_BOOST_RE = re.compile(r"パラメータ値増加\s*\+\s*(\d+)")
_HAND_PARAM_BOOST_RE = re.compile(r"手札の?パラメータ上昇回数?増加\s*\+\s*(\d+)")
_EXTRA_USE_RE = re.compile(r"スキルカード使用数追加\s*\+\s*(\d+)")
_EXTRA_TURN_RE = re.compile(r"ターン追加\s*\+\s*(\d+)")
# 状態への変更 ("強気に変更" / "強気2段階目に変更" / "温存2段階目に変更")
# group(1)=種別、group(2)=段階数(なければ None で1段階扱い)
_STATE_CHANGE_RE = re.compile(
    r"(強気|温存|好調|絶好調|集中|やる気|好印象|全力)(?:(\d+)段階目?)?に変更"
)
_NO_EFFECT_RE = re.compile(r"効果なし")
_STAMINA_USAGE_RE = re.compile(r"^-(\d+)$")  # コスト欄の "-4" 形式

# 成長効果用パターン
_GROWTH_LINE_RE = re.compile(r"\[\s*成長\s*\]|成長[:：]")
_GROWTH_MAX_RE = re.compile(r"[（(]\s*(\d+)\s*回まで\s*[）)]|(\d+)\s*回まで")
_GROWTH_PARAM_REPEAT_RE = re.compile(r"パラメータ上昇回数増加\s*\+\s*(\d+)")
_GROWTH_HP_COST_RE = re.compile(r"体力消費コスト値減少\s*-?\s*(\d+)")
_GROWTH_PARAM_VALUE_RE = re.compile(r"パラメータ値増加\s*\+\s*(\d+)")
_HP_COST_KW_RE = re.compile(r"体力消費\s*(\d+)")  # コスト欄の "体力消費5"
_FULL_POWER_COST_RE = re.compile(r"全力値消費\s*(\d+)")  # コスト欄の "全力値消費3"

EFFECT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (_PARAM_RE, "param"),
    (_GOOD_IMPRESSION_TURNS_RE, "good_impression_turns"),
    (_GOOD_IMPRESSION_RE, "good_impression"),
    (_GREAT_CONDITION_RE, "great_condition"),
    (_GOOD_CONDITION_RE, "good_condition"),
    (_MOTIVATION_RE, "motivation"),
    (_CONCENTRATION_RE, "concentration"),
    (_GENKI_RE, "genki"),
    (_HP_RECOVER_RE, "hp_recover"),
    (_HP_DAMAGE_RE, "hp_damage"),
    (_HP_DAMAGE_KW_RE, "hp_damage"),
    (_DRAW_RE, "draw"),
    (_DISCARD_N_RE, "discard"),
    (_FULL_POWER_RE, "full_power"),
    (_PASSION_ADD_RE, "passion_add"),
    (_PASSION_BONUS_PCT_RE, "passion_bonus_pct"),
    (_HAND_PARAM_BOOST_RE, "hand_param_boost"),
    (_PARAM_BOOST_RE, "param_boost"),
    (_EXTRA_USE_RE, "extra_use"),
    (_EXTRA_TURN_RE, "extra_turn"),
]


@dataclass
class ParsedEffect:
    """1つの効果"""
    kind: str
    value: int | None = None
    raw: str = ""             # 元のテキスト断片 (デバッグ用)
    note: dict[str, Any] = field(default_factory=dict)  # 追加メタデータ


def _normalize_minus(text: str) -> str:
    """半角/全角/カタカナの '−ーｰ―' を ASCII '-' に正規化"""
    for ch in "−ーｰ―‐–—":
        text = text.replace(ch, "-")
    # 全角数字は半角に
    return text.translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def parse_cost(cost_text: str) -> dict:
    """コスト欄テキストを {hp:N, full_power:N, ...} の dict に変換。
    例:
        "-4"          → {"hp": 4}
        "0" / ""      → {}
        "全力値消費3"  → {"full_power": 3}
    """
    cost_text = _normalize_minus(cost_text.strip())
    if not cost_text or cost_text == "0":
        return {}

    m = _STAMINA_USAGE_RE.match(cost_text)
    if m:
        return {"hp": int(m.group(1))}

    m = _HP_COST_KW_RE.search(cost_text)
    if m:
        return {"hp": int(m.group(1))}

    m = _FULL_POWER_COST_RE.search(cost_text)
    if m:
        return {"full_power": int(m.group(1))}

    # 単純数値 (体力以外のコストは v1 では未対応)
    try:
        n = int(cost_text)
        if n < 0:
            return {"hp": abs(n)}
    except ValueError:
        pass
    return {"raw": cost_text}


# 即時効果ではない (このターン中には発動しない) 行のプレフィックス。
# これらで始まる行は v1 ではシミュレータに反映しない (将来 delayed_effect として記録するなら拡張)。
_DELAYED_PREFIXES = (
    "次のターン",
    "次に使用",
    "以降、",
    "以降の",
    "ターン終了時",
    "ターン開始後",
    "次回",
)
# 条件発動 / 成長効果は v1 では未対応
_CONDITIONAL_PREFIXES = (
    "[成長]",
    "成長：",
    "成長:",
)


def _is_delayed_or_conditional(line: str) -> bool:
    stripped = line.lstrip()
    return any(stripped.startswith(p) for p in _DELAYED_PREFIXES) or any(
        stripped.startswith(p) for p in _CONDITIONAL_PREFIXES
    )


def parse_growth(effect_lines: list[str]) -> dict | None:
    """[成長] 行から成長効果定義を抽出。

    Returns:
        { max_count, per_fire: {paramRepeatBonus?, hpCostReduction?, paramValueIncrease?} }
        または成長要素無しなら None
    """
    for line in effect_lines:
        if not _GROWTH_LINE_RE.search(line):
            continue
        # 最大発動回数 (N回まで)
        max_m = _GROWTH_MAX_RE.search(line)
        if max_m:
            max_count = int(max_m.group(1) or max_m.group(2))
        else:
            max_count = 1

        per_fire: dict[str, int] = {}
        m = _GROWTH_PARAM_REPEAT_RE.search(line)
        if m:
            per_fire["paramRepeatBonus"] = int(m.group(1))
        m = _GROWTH_HP_COST_RE.search(line)
        if m:
            per_fire["hpCostReduction"] = int(m.group(1))
        m = _GROWTH_PARAM_VALUE_RE.search(line)
        if m:
            per_fire["paramValueIncrease"] = int(m.group(1))

        if per_fire:
            return {"max_count": max_count, "per_fire": per_fire}
    return None


def parse_effect_text(effect_lines: list[str]) -> tuple[list[ParsedEffect], list[str]]:
    """効果行リストから ParsedEffect リストを抽出。

    Returns:
        (effects, unparsed_lines):
            effects: 構造化できた効果
            unparsed_lines: ルールにマッチしなかった行 / 遅延効果 / 条件効果
    """
    effects: list[ParsedEffect] = []
    unparsed: list[str] = []

    for line in effect_lines:
        # 遅延効果 (次のターン...) や条件効果 ([成長]...) はこのターン中の即時効果ではないため除外
        if _is_delayed_or_conditional(line):
            unparsed.append(f"[delayed/conditional] {line}")
            continue

        matched = False
        # 1行に複数の効果が混ざるケース → 全パターンを順に試す
        for pattern, kind in EFFECT_PATTERNS:
            for m in pattern.finditer(line):
                val = int(m.group(1)) if m.groups() else None
                # パラメータ+N（M回） の場合 count メタを付与
                note: dict | None = None
                if kind == "param" and len(m.groups()) >= 2 and m.group(2):
                    note = {"count": int(m.group(2))}
                effects.append(
                    ParsedEffect(kind=kind, value=val, raw=m.group(0), note=note or {})
                )
                matched = True

        # 手札全捨て (値なし)
        if _DISCARD_ALL_RE.search(line):
            effects.append(ParsedEffect(kind="discard_all", raw="手札を全て捨てる"))
            matched = True

        # 手札入れ替え = 実装上は手札全捨て + draw (draw 枚数はカード側に別途記載)
        if _HAND_REPLACE_RE.search(line):
            effects.append(ParsedEffect(kind="discard_all", raw=line.strip()))
            matched = True

        # 状態変更 ("強気に変更", "強気2段階目に変更", "温存に変更" ...)
        for m in _STATE_CHANGE_RE.finditer(line):
            level = int(m.group(2)) if m.group(2) else 1
            effects.append(
                ParsedEffect(
                    kind="state_change",
                    raw=m.group(0),
                    note={"to": m.group(1), "level": level},
                )
            )
            matched = True

        # 効果なし (トラブル / 一部カード)
        if _NO_EFFECT_RE.search(line):
            effects.append(ParsedEffect(kind="no_effect", raw="効果なし"))
            matched = True

        if not matched:
            unparsed.append(line)

    return effects, unparsed
