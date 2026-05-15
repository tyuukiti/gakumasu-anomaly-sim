/**
 * Pドリンク定義型 (Data/AnomalyCards/drinks.yaml と対応)
 *
 * カードと同じ EffectKind を流用 (services/effectExecutor.ts が共通処理)。
 * - 使用は無料 (cardsPlayableThisTurn を消費しない)
 * - 一度使うと保持リストから消える (本来 1 個ずつ消費)
 */
import type { CardEffect } from './card'

export type DrinkRarity = 'R' | 'SR' | 'SSR'
export type DrinkPlan = 'free' | 'sense' | 'logic' | 'anomaly'

export interface Drink {
  id: string
  name: string
  rarity: DrinkRarity
  plan: DrinkPlan
  cost: { hp?: number }
  effects: CardEffect[]
  remark?: string
}

/** ユーザーが保持している1個のドリンク参照 (instanceId で同名複数を区別) */
export interface DrinkRef {
  drinkId: string
  instanceId: string
}

/** YAML ファイル構造 */
export interface DrinksYamlFile {
  drinks: Drink[]
}
