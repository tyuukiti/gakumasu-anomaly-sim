/**
 * Zustand store — カード/ドリンクカタログ + ユーザー入力 + 探索結果
 */
import { create } from 'zustand'
import type { Card } from '../types/card'
import type { Drink, DrinkRef } from '../types/drink'
import type { CardRef, StatusInputValues } from '../types/gameState'
import type { SearchResult } from '../types/searchResult'
import type { CardCatalog } from '../services/cardCatalog'
import type { DrinkCatalog } from '../services/drinkCatalog'
import type { CardCustomizationOption } from '../types/customization'
import { buildCatalog } from '../services/cardCatalog'
import { buildDrinkCatalog } from '../services/drinkCatalog'
import { loadAllCards, loadAllDrinks, loadAllCustomizations } from '../services/yamlLoader'
import { searchOptimalMoves } from '../services/moveSearch'
import { makeInitialState } from '../services/gameState'
import { trackEvent } from '../utils/analytics'

interface SimulatorState {
  // ---- データ ----
  cards: Card[]
  drinks: Drink[]
  catalog: CardCatalog | null
  drinkCatalog: DrinkCatalog | null
  /** カードID → カスタマイズオプション定義 (customizations.yaml) */
  customizationOptions: Record<string, CardCustomizationOption[]>

  // ---- ロード状態 ----
  isLoading: boolean
  error: string | null

  // ---- ユーザー入力 ----
  hand: CardRef[]
  deck: CardRef[]
  discard: CardRef[]
  heldDrinks: DrinkRef[]
  status: StatusInputValues

  // ---- 探索結果 ----
  result: SearchResult | null
  isSearching: boolean

  // ---- アクション ----
  initialize: () => Promise<void>
  addToZone: (zone: 'hand' | 'deck' | 'discard', ref: CardRef) => void
  removeFromZone: (zone: 'hand' | 'deck' | 'discard', instanceId: string) => void
  clearZone: (zone: 'hand' | 'deck' | 'discard') => void
  updateCardCustom: (
    zone: 'hand' | 'deck' | 'discard',
    instanceId: string,
    partial: Partial<
      Pick<
        CardRef,
        | 'customNoExile'
        | 'customRemoveHpCost'
        | 'customRemoveFullPowerCost'
        | 'customExtraParamRepeats'
        | 'customHpCostReduction'
      >
    >,
  ) => void
  addDrink: (ref: DrinkRef) => void
  removeDrink: (instanceId: string) => void
  clearDrinks: () => void
  updateStatus: (partial: Partial<StatusInputValues>) => void
  resetAll: () => void
  runSearch: () => void
  /** 現在の状態を JSON 文字列としてエクスポート */
  exportState: () => string
  /** JSON 文字列を読んで状態を復元 */
  importState: (text: string) => { ok: boolean; error?: string }
}

// 体力 / 元気 / 全力値 はスコアに影響しないため UI 非表示。
// コスト計算が予期せぬ負値で停止しないよう十分大きい既定値で固定。
const DEFAULT_STATUS: StatusInputValues = {
  hp: 9999,
  maxHp: 9999,
  genki: 0,
  fullPower: 9999,
  passionBuff: 0,
  stance: { kind: 'neutral', level: 0 },
  passionGainBonusPct: 0,
  paramBoostPct: 0,
  cardsPlayableThisTurn: 1,
}

let _instanceCounter = 0
export function newInstanceId(): string {
  return `i${++_instanceCounter}_${Math.random().toString(36).slice(2, 8)}`
}

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  cards: [],
  drinks: [],
  catalog: null,
  drinkCatalog: null,
  customizationOptions: {},
  isLoading: true,
  error: null,
  hand: [],
  deck: [],
  discard: [],
  heldDrinks: [],
  status: { ...DEFAULT_STATUS },
  result: null,
  isSearching: false,

  initialize: async () => {
    try {
      const [cards, drinks, customizationOptions] = await Promise.all([
        loadAllCards(),
        loadAllDrinks(),
        loadAllCustomizations(),
      ])
      const catalog = buildCatalog(cards)
      const drinkCatalog = buildDrinkCatalog(drinks)
      set({ cards, drinks, catalog, drinkCatalog, customizationOptions, isLoading: false, error: null })
      trackEvent('app_initialized', {
        card_count: cards.length,
        drink_count: drinks.length,
      })
    } catch (e) {
      console.error(e)
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) })
      trackEvent('app_init_error', { message: e instanceof Error ? e.message : String(e) })
    }
  },

  addToZone: (zone, ref) => {
    set((s) => ({ [zone]: [...s[zone], ref] } as Partial<SimulatorState>))
    trackEvent('card_add', { zone, card_id: ref.cardId, level: ref.level })
  },

  removeFromZone: (zone, instanceId) => {
    set((s) => ({
      [zone]: s[zone].filter((c) => c.instanceId !== instanceId),
    } as Partial<SimulatorState>))
    trackEvent('card_remove', { zone })
  },

  clearZone: (zone) => {
    set({ [zone]: [] } as Partial<SimulatorState>)
    trackEvent('zone_clear', { zone })
  },

  updateCardCustom: (zone, instanceId, partial) => {
    set((s) => ({
      [zone]: s[zone].map((c) =>
        c.instanceId === instanceId ? { ...c, ...partial } : c,
      ),
    } as Partial<SimulatorState>))
    trackEvent('card_customize', {
      zone,
      changed_keys: Object.keys(partial).join(','),
    })
  },

  addDrink: (ref) => {
    set((s) => ({ heldDrinks: [...s.heldDrinks, ref] }))
    trackEvent('drink_add', { drink_id: ref.drinkId })
  },
  removeDrink: (instanceId) => {
    set((s) => ({ heldDrinks: s.heldDrinks.filter((d) => d.instanceId !== instanceId) }))
    trackEvent('drink_remove')
  },
  clearDrinks: () => {
    set({ heldDrinks: [] })
    trackEvent('drink_clear')
  },

  updateStatus: (partial) => {
    set((s) => ({ status: { ...s.status, ...partial } }))
    // 個々の入力は頻度が高いので key 名だけ送る (値は送らない)
    trackEvent('status_change', { keys: Object.keys(partial).join(',') })
  },

  resetAll: () => {
    set({
      hand: [],
      deck: [],
      discard: [],
      heldDrinks: [],
      status: { ...DEFAULT_STATUS },
      result: null,
    })
    trackEvent('reset_all')
  },

  runSearch: () => {
    const { catalog, drinkCatalog, hand, deck, discard, heldDrinks, status } = get()
    if (!catalog || !drinkCatalog) return
    set({ isSearching: true })
    trackEvent('search_start', {
      hand_size: hand.length,
      deck_size: deck.length,
      discard_size: discard.length,
      drinks_size: heldDrinks.length,
      cards_playable: status.cardsPlayableThisTurn,
      stance_kind: status.stance.kind,
      stance_level: status.stance.level,
      passion_buff: status.passionBuff,
      passion_gain_bonus_pct: status.passionGainBonusPct,
      param_boost_pct: status.paramBoostPct,
    })
    setTimeout(() => {
      try {
        const initial = makeInitialState(hand, deck, discard, status, heldDrinks)
        const t0 = performance.now()
        const result = searchOptimalMoves(initial, catalog, drinkCatalog)
        const elapsed = performance.now() - t0
        set({ result, isSearching: false })
        const topScore = result.patterns[0]?.expectedScore ?? 0
        const topProb = result.patterns[0]?.patternProbability ?? 0
        trackEvent('search_complete', {
          pattern_count: result.patterns.length,
          explored_leaves: result.exploredLeafCount,
          pruned_count: result.prunedCount,
          elapsed_ms: Math.round(elapsed),
          top_score: Math.round(topScore),
          top_probability: Math.round(topProb * 100) / 100,
        })
      } catch (e) {
        console.error(e)
        set({ isSearching: false, error: e instanceof Error ? e.message : String(e) })
        trackEvent('search_error', { message: e instanceof Error ? e.message : String(e) })
      }
    }, 0)
  },

  exportState: () => {
    trackEvent('state_export', {
      hand_size: get().hand.length,
      deck_size: get().deck.length,
      discard_size: get().discard.length,
      drinks_size: get().heldDrinks.length,
    })
    const { hand, deck, discard, heldDrinks, status, catalog, drinkCatalog } = get()
    // CardRef を可読 dict に変換 (カード名も入れる)
    const toCard = (cr: CardRef) => {
      const c = catalog?.byId.get(cr.cardId)
      const out: Record<string, unknown> = { cardId: cr.cardId, level: cr.level }
      if (c) out.name = c.name
      // カスタムフラグはセットされているものだけ含める
      if (cr.customNoExile) out.customNoExile = true
      if (cr.customRemoveHpCost) out.customRemoveHpCost = true
      if (cr.customRemoveFullPowerCost) out.customRemoveFullPowerCost = true
      if (cr.customExtraParamRepeats) out.customExtraParamRepeats = cr.customExtraParamRepeats
      if (cr.customHpCostReduction) out.customHpCostReduction = cr.customHpCostReduction
      return out
    }
    const toDrink = (dr: DrinkRef) => {
      const d = drinkCatalog?.byId.get(dr.drinkId)
      return d ? { drinkId: dr.drinkId, name: d.name } : { drinkId: dr.drinkId }
    }
    const data = {
      version: 1,
      status: {
        passionBuff: status.passionBuff,
        passionGainBonusPct: status.passionGainBonusPct,
        paramBoostPct: status.paramBoostPct,
        stance: status.stance,
        cardsPlayableThisTurn: status.cardsPlayableThisTurn,
        // 非表示のステータスも参考情報として含める
        hp: status.hp,
        maxHp: status.maxHp,
        genki: status.genki,
        fullPower: status.fullPower,
      },
      hand: hand.map(toCard),
      deck: deck.map(toCard),
      discard: discard.map(toCard),
      heldDrinks: heldDrinks.map(toDrink),
    }
    return JSON.stringify(data, null, 2)
  },

  importState: (text: string) => {
    try {
      const data = JSON.parse(text)
      if (!data || typeof data !== 'object') {
        return { ok: false, error: 'JSON ではありません' }
      }
      const newHand: CardRef[] = (data.hand ?? []).map((c: Record<string, unknown>) => ({
        cardId: String(c.cardId),
        level: c.level as CardRef['level'],
        instanceId: newInstanceId(),
        customNoExile: c.customNoExile === true ? true : undefined,
        customRemoveHpCost: c.customRemoveHpCost === true ? true : undefined,
        customRemoveFullPowerCost: c.customRemoveFullPowerCost === true ? true : undefined,
        customExtraParamRepeats: typeof c.customExtraParamRepeats === 'number' ? c.customExtraParamRepeats : undefined,
        customHpCostReduction: typeof c.customHpCostReduction === 'number' ? c.customHpCostReduction : undefined,
      }))
      const newDeck: CardRef[] = (data.deck ?? []).map((c: Record<string, unknown>) => ({
        cardId: String(c.cardId),
        level: c.level as CardRef['level'],
        instanceId: newInstanceId(),
        customNoExile: c.customNoExile === true ? true : undefined,
        customRemoveHpCost: c.customRemoveHpCost === true ? true : undefined,
        customRemoveFullPowerCost: c.customRemoveFullPowerCost === true ? true : undefined,
        customExtraParamRepeats: typeof c.customExtraParamRepeats === 'number' ? c.customExtraParamRepeats : undefined,
        customHpCostReduction: typeof c.customHpCostReduction === 'number' ? c.customHpCostReduction : undefined,
      }))
      const newDiscard: CardRef[] = (data.discard ?? []).map((c: Record<string, unknown>) => ({
        cardId: String(c.cardId),
        level: c.level as CardRef['level'],
        instanceId: newInstanceId(),
        customNoExile: c.customNoExile === true ? true : undefined,
        customRemoveHpCost: c.customRemoveHpCost === true ? true : undefined,
        customRemoveFullPowerCost: c.customRemoveFullPowerCost === true ? true : undefined,
        customExtraParamRepeats: typeof c.customExtraParamRepeats === 'number' ? c.customExtraParamRepeats : undefined,
        customHpCostReduction: typeof c.customHpCostReduction === 'number' ? c.customHpCostReduction : undefined,
      }))
      const newDrinks: DrinkRef[] = (data.heldDrinks ?? []).map((d: Record<string, unknown>) => ({
        drinkId: String(d.drinkId),
        instanceId: newInstanceId(),
      }))
      const newStatus: StatusInputValues = {
        ...DEFAULT_STATUS,
        ...((data.status ?? {}) as Partial<StatusInputValues>),
      }
      // stance はネスト構造なのでマージ調整
      if (data.status?.stance) newStatus.stance = data.status.stance
      set({
        hand: newHand,
        deck: newDeck,
        discard: newDiscard,
        heldDrinks: newDrinks,
        status: newStatus,
        result: null,
      })
      trackEvent('state_import', {
        hand_size: newHand.length,
        deck_size: newDeck.length,
        discard_size: newDiscard.length,
        drinks_size: newDrinks.length,
      })
      return { ok: true }
    } catch (e) {
      trackEvent('state_import_error', {
        message: e instanceof Error ? e.message : String(e),
      })
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
}))
