/**
 * ドリンクIDで Drink 定義を検索する小型カタログ
 */
import type { Drink } from '../types/drink'

export interface DrinkCatalog {
  byId: Map<string, Drink>
  list: Drink[]
}

export function buildDrinkCatalog(drinks: Drink[]): DrinkCatalog {
  const byId = new Map<string, Drink>()
  for (const d of drinks) byId.set(d.id, d)
  const list = [...drinks].sort((a, b) => {
    // SSR → SR → R の順、続いて名前順
    const rank: Record<string, number> = { SSR: 0, SR: 1, R: 2 }
    const dr = (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9)
    return dr !== 0 ? dr : a.name.localeCompare(b.name, 'ja')
  })
  return { byId, list }
}
