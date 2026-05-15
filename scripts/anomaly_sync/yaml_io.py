"""YAMLファイル入出力"""
from __future__ import annotations

from pathlib import Path

import yaml


def save_cards_yaml(cards: list[dict], filepath: Path) -> None:
    """カードリストを YAML に書き出す。

    出力形式:
        cards:
          - id: ...
            name: ...
            ...
    """
    filepath.parent.mkdir(parents=True, exist_ok=True)
    payload = {"cards": cards}
    # allow_unicode=True で日本語をそのまま出力
    # sort_keys=False でフィールド順序を維持
    text = yaml.safe_dump(
        payload,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=200,
    )
    # 改行を CRLF に正規化 (プロジェクト規約)
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    filepath.write_bytes(text.encode("utf-8"))


def load_overrides(filepath: Path) -> dict[str, dict]:
    """overrides.yaml を読み込み {card_id: override_dict} を返す。
    ファイルが存在しなければ空 dict。
    """
    if not filepath.exists():
        return {}
    with open(filepath, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    overrides = data.get("overrides", {})
    if not isinstance(overrides, dict):
        return {}
    return overrides


def merge_overrides(card: dict, overrides: dict[str, dict]) -> dict:
    """カードに override を浅くマージ。override 側が優先。
    `variants` フィールドは特別扱いで level ベースでマージ。
    """
    ov = overrides.get(card["id"])
    if not ov:
        return card

    merged = dict(card)
    for k, v in ov.items():
        if k == "variants" and isinstance(v, list):
            # level ベースでマージ
            by_level = {x["level"]: dict(x) for x in card.get("variants", [])}
            for ov_v in v:
                lvl = ov_v.get("level")
                if lvl in by_level:
                    by_level[lvl].update(ov_v)
                else:
                    by_level[lvl] = ov_v
            merged["variants"] = list(by_level.values())
        else:
            merged[k] = v
    merged["_needs_review"] = False
    return merged
