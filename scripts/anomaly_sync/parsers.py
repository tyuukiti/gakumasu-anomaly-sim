"""Wikiスキルカード一覧ページの解析

ページ構造（実測）:
- 1ページ内に複数の data table が存在し、各 table は1カテゴリ分のカードを保持
- 各カードは 7 行ブロック:
    row 0: 名前 + (com_*_*_*_*) | レア | rarity | タイプ | type | カスタム上限 | limit | 編集
    row 1: 強化レベル列ヘッダ (+, 消費, 効果, 備考, 編集)
    row 2..5: 4 段階 (無印, +, ++, +++) の (level, cost, effect_html, [備考], 編集)
    row 6: 末尾空行 (colspan=9)
- 効果セルは <br/> 区切り、強化値は <span style="color:blue;"><b>...</b></span>、
  キーワードは <span style="background-color:lightgray;">...</span>
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterator

from bs4 import BeautifulSoup, Tag

# 全カテゴリ共通の ID パターン
# 例: com_F_N_A_0001 / com_A_SSR_M_0007 / com_A_Leg_A_0001 / com_T_N_0001
# rarity は N / R / SR / SSR / Leg などの英字列、type letter は省略可 (トラブル)
ID_RE = re.compile(r"\(com_([A-Z])_([A-Za-z]+)(?:_([A-Z]+))?_(\d+)\)")
NAME_ID_RE = re.compile(
    r"^(.+?)\s*\(com_([A-Z])_([A-Za-z]+)(?:_([A-Z]+))?_(\d+)\)\s*$",
    re.S,
)

# P-Idol 固有スキルカードの ID パターン
# 例: Saki_R_0001 / Misuzu_SSR_0007 / Lilja_SR_0001
PIDOL_ID_RE = re.compile(r"\(([A-Z][a-zA-Z]+)_([A-Za-z]+)_(\d+)\)")
PIDOL_NAME_ID_RE = re.compile(
    r"^(.+?)\s*\(([A-Z][a-zA-Z]+)_([A-Za-z]+)_(\d+)\)\s*$",
    re.S,
)

# カード先頭行検出 (com_* or PIdol 名称_*)
_ANY_CARD_ID_HINT_RE = re.compile(
    r"\((?:com_[A-Z]_|[A-Z][a-zA-Z]+_)[A-Za-z]+(?:_[A-Z]+)?_\d+\)"
)

# <br/> 置換用センチネル (ASCII Unit Separator = Wiki本文に出現しない安全な区切り)
_LINE_SEP = "\x1f"


@dataclass
class WikiVariant:
    """1カードの1強化レベル分のデータ"""
    level: str            # 無印 / + / ++ / +++
    cost_text: str        # "-4" など (HP消費はマイナス符号付き数値)
    effect_lines: list[str] = field(default_factory=list)  # <br/>分割済みの効果テキスト行


@dataclass
class WikiCard:
    """Wikiから抽出された1カードの生データ"""
    wiki_id: str          # com_A_N_A_0001 形式 (パース後の正規ID)
    category: str         # free / anomaly / trouble
    rarity: str           # N / R / SR / SSR
    type_code: str | None  # A / M / None (トラブルはNone)
    serial: str           # 0001
    name: str
    type_text: str        # "アクティブ" / "メンタル" / "トラブル"
    custom_limit_text: str  # "対象外" / "1" 等
    variants: list[WikiVariant] = field(default_factory=list)
    remark_text: str = ""  # 備考欄
    # カスタム情報抽出用に block 行を保持 (YAML 出力には含めない)
    raw_block: list = field(default_factory=list)
    # P-Idol 固有カードのみ: 所属キャラ名 (Saki / Misuzu 等の英字ID)
    owner: str | None = None


# ======== テーブル特定 ========

def _table_category(table: Tag) -> str | None:
    """テーブルに含まれるカードIDから所属カテゴリ(F/A/T)を判定。混在テーブルなら None。"""
    text = table.get_text()
    ids = ID_RE.findall(text)
    if not ids:
        return None
    cats = {i[0] for i in ids}
    if len(cats) != 1:
        return None
    return cats.pop()


def _table_pidol_owner(table: Tag) -> str | None:
    """P-Idol 固有カードを保持するテーブルか判定。所属キャラ名(英字ID)を返す。
    混在/該当なしなら None。"""
    text = table.get_text()
    # com_* と被らないよう、まず com_ ID が無いことを確認
    if ID_RE.search(text):
        return None
    ids = PIDOL_ID_RE.findall(text)
    if not ids:
        return None
    owners = {i[0] for i in ids}
    if len(owners) != 1:
        return None
    return owners.pop()


def find_category_tables(soup: BeautifulSoup, target_prefixes: list[str]) -> dict[str, Tag]:
    """指定 prefix (F/A/T 等) のカードを保持するテーブルを抽出"""
    result: dict[str, Tag] = {}
    for table in soup.find_all("table"):
        cat = _table_category(table)
        if cat and cat in target_prefixes and cat not in result:
            result[cat] = table
    return result


def find_pidol_tables(soup: BeautifulSoup) -> dict[str, Tag]:
    """P-Idol 固有カードテーブルを {キャラ英字名: table} で返す"""
    result: dict[str, Tag] = {}
    for table in soup.find_all("table"):
        owner = _table_pidol_owner(table)
        if owner and owner not in result:
            result[owner] = table
    return result


# ======== 行ブロック分解 ========

def _iter_card_blocks(table: Tag) -> Iterator[list[Tag]]:
    """テーブルをカード単位に分解し各ブロックをyield。

    カード先頭行の特徴:
        - cells[0] に rowspan 属性 (整数) があり、テキストにカードID形式の括弧表記を含む
          (com_X_..._..._NNNN または <CharName>_<rarity>_NNNN)

    ブロックサイズ = rowspan + 1 (末尾の "閉じ" 空行を含む)。
    """
    rows = table.find_all("tr")
    i = 0
    while i < len(rows):
        cells = rows[i].find_all(["td", "th"])
        if not cells:
            i += 1
            continue
        rs = cells[0].get("rowspan")
        if rs and rs.isdigit() and _ANY_CARD_ID_HINT_RE.search(cells[0].get_text()):
            span = int(rs)
            block = rows[i : i + span + 1]
            yield block
            i += span + 1
        else:
            i += 1


def _parse_effect_cell(cell: Tag) -> list[str]:
    """効果セルを <br/> で分割しテキスト行リストに変換。
    キーワードspan (lightgray) / 強化色span (blue bold) は中のテキストをそのまま採用。
    """
    # <br/> をセンチネルに置換し、最後に分割
    for br in cell.find_all("br"):
        br.replace_with(_LINE_SEP)
    text = cell.get_text()
    lines = [s.strip() for s in text.split(_LINE_SEP)]
    return [s for s in lines if s]


_VARIANT_LEVELS = {"無印", "+", "++", "+++"}


def _parse_card_block(block: list[Tag], category: str) -> WikiCard | None:
    """1カード分の行ブロックを WikiCard に変換。
    ブロックサイズは可変 (3〜11行+1の閉じ行)。カスタム段階行は無視 (将来拡張)。
    """
    if len(block) < 3:
        return None
    head = block[0].find_all(["td", "th"])
    if not head:
        return None

    # 先頭セル: 名前 + (com_X_..._..._NNNN) または (CharName_rarity_NNNN)
    name_id_text = head[0].get_text(separator="\n").strip()
    flat_text = name_id_text.replace("\n", "").strip()
    flat = re.sub(r"\s+", "", name_id_text)

    is_pidol = False
    m = NAME_ID_RE.match(flat_text) or NAME_ID_RE.match(flat)
    if m:
        name = m.group(1).strip()
        cat_letter = m.group(2)
        rarity = m.group(3)
        type_letter = m.group(4)
        serial = m.group(5)
    else:
        m = PIDOL_NAME_ID_RE.match(flat_text) or PIDOL_NAME_ID_RE.match(flat)
        if not m:
            return None
        is_pidol = True
        name = m.group(1).strip()
        cat_letter = m.group(2)  # 実際はキャラ名 (Saki/Misuzu/...)
        rarity = m.group(3)
        type_letter = None
        serial = m.group(4)

    head_text = " ".join(c.get_text(" ", strip=True) for c in head)
    type_text = ""
    for kw in ("アクティブ", "メンタル", "トラブル"):
        if kw in head_text:
            type_text = kw
            break
    custom_limit_text = ""
    m2 = re.search(r"カスタム上限\s*([対象外0-9]+)", head_text)
    if m2:
        custom_limit_text = m2.group(1)

    # ブロック内の行を走査し、cells[0] が 無印/+/++/+++ の行のみを variant として採用
    # (カスタム段階行 / 閉じ空行 / variant ヘッダ行 はスキップ)
    variants: list[WikiVariant] = []
    remark_text = ""
    for ri, row in enumerate(block[1:]):
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue
        # variant 行は <td> 主体。ヘッダ行 (cells[0] が <th>) はスキップ
        if cells[0].name == "th":
            continue
        level = cells[0].get_text(strip=True)
        if level not in _VARIANT_LEVELS:
            continue
        cost_text = cells[1].get_text(strip=True)

        effect_cell = None
        for c in cells[1:]:
            if c.get("colspan") == "4":
                effect_cell = c
                break
        if effect_cell is None and len(cells) > 2:
            effect_cell = cells[2]
        effect_lines = _parse_effect_cell(effect_cell) if effect_cell else []

        # 備考は 無印 行に rowspan で存在
        if not variants and not remark_text:
            for c in cells:
                if c.get("rowspan") and c.get("colspan") == "2":
                    remark_text = c.get_text(separator="\n", strip=True)
                    break

        variants.append(WikiVariant(level=level, cost_text=cost_text, effect_lines=effect_lines))

    if is_pidol:
        # P-Idol 固有: <CharName>_<rarity>_<serial>
        wiki_id = f"{cat_letter}_{rarity}_{serial}"
        # category は呼び出し側から 'pidol' が渡る想定。owner はキャラ名 (cat_letter)
        used_category = "pidol"
    else:
        wiki_id = (
            f"com_{cat_letter}_{rarity}_{type_letter}_{serial}"
            if type_letter
            else f"com_{cat_letter}_{rarity}_{serial}"
        )
        used_category = category

    return WikiCard(
        wiki_id=wiki_id,
        category=used_category,
        rarity=rarity,
        type_code=type_letter,
        serial=serial,
        name=name,
        type_text=type_text,
        custom_limit_text=custom_limit_text,
        variants=variants,
        remark_text=remark_text,
        raw_block=block,
        owner=(cat_letter if is_pidol else None),
    )


def parse_skill_card_page(html: str, target_category_prefixes: list[str]) -> dict[str, list[WikiCard]]:
    """スキルカード一覧ページHTMLから指定カテゴリのカードを抽出

    Args:
        html: ページ全文(UTF-8)
        target_category_prefixes: 'F', 'A', 'T' などの prefix リスト

    Returns:
        {prefix: [WikiCard, ...]}
    """
    soup = BeautifulSoup(html, "html.parser")
    from .constants import CATEGORY_PREFIX_MAP

    tables = find_category_tables(soup, target_category_prefixes)
    result: dict[str, list[WikiCard]] = {}
    for prefix, table in tables.items():
        cat_name = CATEGORY_PREFIX_MAP[prefix]
        cards: list[WikiCard] = []
        for block in _iter_card_blocks(table):
            card = _parse_card_block(block, cat_name)
            if card:
                cards.append(card)
        result[prefix] = cards
    return result


def parse_pidol_section(html: str) -> list[WikiCard]:
    """P-Idol 固有スキルカードを全キャラ分まとめて取得"""
    soup = BeautifulSoup(html, "html.parser")
    tables = find_pidol_tables(soup)
    all_cards: list[WikiCard] = []
    for owner, table in tables.items():
        for block in _iter_card_blocks(table):
            card = _parse_card_block(block, "pidol")
            if card:
                # owner が無いブロックは parse 側で None になる可能性があるので保険
                if not card.owner:
                    card.owner = owner
                all_cards.append(card)
    return all_cards


# サポートイベント固有スキル: 親サポカ名を「<名前>」固有 or 「<名前>」より入手 から抽出
_OWNER_FROM_REMARK_RE = re.compile(r"「\s*([^」]+?)\s*」\s*(?:より入手|固有)")
# 行頭が name + メタ行 (レア/タイプ/カスタム上限) を含むかで card start を判定
_SP_CARD_START_HINT = ("レア", "タイプ", "カスタム上限")


def _iter_sp_card_blocks(table: Tag) -> Iterator[list[Tag]]:
    """SP (no-id) テーブルから card block を yield。
    判定: cells[0] に rowspan があり、その行全体に 'レア','タイプ','カスタム上限' を含む。"""
    rows = table.find_all("tr")
    i = 0
    while i < len(rows):
        cells = rows[i].find_all(["td", "th"])
        if not cells:
            i += 1
            continue
        rs = cells[0].get("rowspan")
        row_text = rows[i].get_text()
        if (
            rs and rs.isdigit()
            and all(h in row_text for h in _SP_CARD_START_HINT)
        ):
            # ヘッダ行 (種類/段階) は除外: 'カスタム' 単独セルで rowspan
            head = cells[0].get_text(strip=True)
            if head in ("カスタム", "カ\nス\nタ\nム"):
                i += 1
                continue
            span = int(rs)
            block = rows[i : i + span + 1]
            yield block
            i += span + 1
        else:
            i += 1


def _parse_sp_card_block(block: list[Tag], serial: str) -> WikiCard | None:
    """SP (ID 無し) カード1ブロックを WikiCard に変換。serial は外部から付与"""
    if len(block) < 3:
        return None
    head = block[0].find_all(["td", "th"])
    if not head:
        return None

    name = head[0].get_text(separator="\n").strip().replace("\n", "")
    if not name:
        return None

    head_text = " ".join(c.get_text(" ", strip=True) for c in head)
    # レア
    rarity_m = re.search(r"レア\s*([NRSL][A-Z]*)", head_text)
    rarity = rarity_m.group(1) if rarity_m else "?"
    # タイプ
    type_text = ""
    for kw in ("アクティブ", "メンタル", "トラブル"):
        if kw in head_text:
            type_text = kw
            break
    # カスタム上限
    custom_limit_text = ""
    m2 = re.search(r"カスタム上限\s*([対象外0-9]+)", head_text)
    if m2:
        custom_limit_text = m2.group(1)

    # 4 variants
    variants: list[WikiVariant] = []
    remark_text = ""
    for ri, row in enumerate(block[1:]):
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue
        if cells[0].name == "th":
            continue
        level = cells[0].get_text(strip=True)
        if level not in _VARIANT_LEVELS:
            continue
        cost_text = cells[1].get_text(strip=True)
        effect_cell = None
        for c in cells[1:]:
            if c.get("colspan") == "4":
                effect_cell = c
                break
        if effect_cell is None and len(cells) > 2:
            effect_cell = cells[2]
        effect_lines = _parse_effect_cell(effect_cell) if effect_cell else []
        if not variants and not remark_text:
            for c in cells:
                if c.get("rowspan") and c.get("colspan") == "2":
                    remark_text = c.get_text(separator="\n", strip=True)
                    break
        variants.append(
            WikiVariant(level=level, cost_text=cost_text, effect_lines=effect_lines)
        )

    # owner (親サポカ名)
    owner = None
    if remark_text:
        m = _OWNER_FROM_REMARK_RE.search(remark_text.replace("\n", ""))
        if m:
            owner = m.group(1).strip()

    wiki_id = f"SP_{rarity}_{serial}"
    return WikiCard(
        wiki_id=wiki_id,
        category="pidol",  # 固有スキル系として一括管理
        rarity=rarity,
        type_code=None,
        serial=serial,
        name=name,
        type_text=type_text,
        custom_limit_text=custom_limit_text,
        variants=variants,
        remark_text=remark_text,
        raw_block=block,
        owner=owner,
    )


def parse_sp_section(html: str) -> list[WikiCard]:
    """サポートイベント固有スキル (ID 無しテーブル) を抽出"""
    soup = BeautifulSoup(html, "html.parser")
    cards: list[WikiCard] = []
    counter_by_rarity: dict[str, int] = {}
    for table in soup.find_all("table"):
        text = table.get_text()
        # com_* または PIdol ID を持つテーブルはスキップ
        if ID_RE.search(text) or PIDOL_ID_RE.search(text):
            continue
        for block in _iter_sp_card_blocks(table):
            # rarity を先読みするため、まず暫定 ID で構築
            head_text = " ".join(
                c.get_text(" ", strip=True) for c in block[0].find_all(["td", "th"])
            )
            rarity_m = re.search(r"レア\s*([NRSL][A-Z]*)", head_text)
            rarity = rarity_m.group(1) if rarity_m else "?"
            counter_by_rarity[rarity] = counter_by_rarity.get(rarity, 0) + 1
            serial = f"{counter_by_rarity[rarity]:04d}"
            card = _parse_sp_card_block(block, serial)
            if card:
                cards.append(card)
    return cards
