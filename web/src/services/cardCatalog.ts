/**
 * カードID/レベル → variant への高速ルックアップ
 */
import type { Card, CardVariant, EnhanceLevel } from '../types/card'

export interface CardCatalog {
  byId: Map<string, Card>
  /** UI 検索用に名前順にソートしたリスト */
  list: Card[]
  /** 検索 (部分一致, 大文字小文字無視) */
  search(q: string): Card[]
  /** variant 取得 (未指定なら最大強化を返す) */
  getVariant(cardId: string, level?: EnhanceLevel): CardVariant | undefined
  /** 表示用に "(ID) 名前 [+++]" のラベルを返す */
  formatLabel(cardId: string, level: EnhanceLevel): string
}

const LEVEL_ORDER: EnhanceLevel[] = ['+++', '++', '+', '無印']

export function buildCatalog(cards: Card[]): CardCatalog {
  const byId = new Map<string, Card>()
  for (const c of cards) byId.set(c.id, c)
  const list = [...cards].sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  const catalog: CardCatalog = {
    byId,
    list,
    search(q: string) {
      const needle = q.trim().toLowerCase()
      if (!needle) return list
      return list.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.id.toLowerCase().includes(needle),
      )
    },
    getVariant(cardId, level) {
      const card = byId.get(cardId)
      if (!card) return undefined
      if (level) {
        return card.variants.find((v) => v.level === level)
      }
      // 強い順に探して最初に存在するものを返す
      for (const lv of LEVEL_ORDER) {
        const v = card.variants.find((vv) => vv.level === lv)
        if (v) return v
      }
      return card.variants[0]
    },
    formatLabel(cardId, level) {
      const c = byId.get(cardId)
      if (!c) return cardId
      return `${c.name} [${level}]`
    },
  }
  return catalog
}
