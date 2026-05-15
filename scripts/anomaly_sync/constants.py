"""定数定義"""
from pathlib import Path

WIKI_BASE = "https://seesaawiki.jp/gakumasu"
# スキルカード一覧ページ (EUC-JP URLエンコード)
SKILL_LIST_URL = f"{WIKI_BASE}/d/%A5%B9%A5%AD%A5%EB%A5%AB%A1%BC%A5%C9%B0%EC%CD%F7"

DATA_DIR = Path(__file__).parent.parent.parent / "Data" / "AnomalyCards"

# カテゴリのID prefix → 内部キー
# Wikiの (com_X_<rarity>_<type>_<serial>) の X 部分
CATEGORY_PREFIX_MAP = {
    "F": "free",        # フリー (全カテゴリ共通枠)
    "A": "anomaly",     # アノマリー
    "T": "trouble",     # トラブル
}

# 出力対象カテゴリ (キー: 内部名, 値: 出力ファイル名)
CATEGORY_OUTPUT_FILES = {
    "free": "free_cards.yaml",
    "anomaly": "anomaly_cards.yaml",
    "trouble": "trouble_cards.yaml",
    "pidol": "pidol_cards.yaml",
}

# トラブルカード用 ID パターン (rarity のみ、type letterなし): com_T_<rarity>_<serial>
# フリー・アノマリー用 ID パターン: com_<X>_<rarity>_<type>_<serial>
# X = F | A、type = A(アクティブ) | M(メンタル)

# カード type 略号 → 内部値
ACTIVE_PASSIVE_MAP = {
    "A": "active",      # アクティブ
    "M": "mental",      # メンタル
}

DEFAULT_DELAY = 1.0
