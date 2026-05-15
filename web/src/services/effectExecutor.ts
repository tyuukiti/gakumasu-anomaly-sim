/**
 * 1枚のカードをプレイした結果の GameState 遷移を計算する。
 *
 * アノマリーモード仕様反映:
 *   - 強気スタンス時 param 効果は倍率を受ける
 *       * 強気1段階: ×AGGRESSIVE_LV1_PARAM_MULT (2.0)
 *       * 強気2段階: ×AGGRESSIVE_LV2_PARAM_MULT (2.5)
 *   - state_change で 温存(N段階) → 強気 の遷移時:
 *       passion += (温存1→強気=5 / 温存2→強気=8) × (1 + passionGainBonusPct/100)
 *   - 熱意追加(passion_add) はそのまま passion へ累積
 *   - 熱意増加%(passion_bonus_pct) は passionGainBonusPct へ加算
 */
import type { CardCatalog } from './cardCatalog'
import type { DrinkCatalog } from './drinkCatalog'
import type { CardEffect } from '../types/card'
import type { GameState, CardRef, Stance, StanceKind } from '../types/gameState'
import type { DrinkRef } from '../types/drink'
import { cloneState, reshuffleDiscardIntoDeck } from './gameState'
import {
  AGGRESSIVE_LV1_PARAM_MULT,
  AGGRESSIVE_LV2_PARAM_MULT,
  PASSION_GAIN_FROM_CONSERVE_LV1,
  PASSION_GAIN_FROM_CONSERVE_LV2,
  PASSION_GAIN_FROM_CONSERVE_LV3,
  RELEASE_EXTRA_USE,
  RELEASE_FIXED_GENKI_LV2_PLUS,
} from '../utils/constants'

export interface SuccessorState {
  state: GameState
  probability: number
  /** このプレイで実際にドローされたカード (順番に積む) */
  drawnCards?: CardRef[]
}

export function applyEffectsInline(
  state: GameState,
  effects: CardEffect[],
  ctx?: { paramRepeatBonus?: number },
): GameState {
  let s = state
  for (const e of effects) {
    s = applyOne(s, e, ctx)
  }
  return s
}

function aggressiveParamMult(stance: Stance): number {
  if (stance.kind !== 'aggressive') return 1.0
  if (stance.level >= 2) return AGGRESSIVE_LV2_PARAM_MULT
  return AGGRESSIVE_LV1_PARAM_MULT
}

function applyOne(
  s: GameState,
  e: CardEffect,
  ctx?: { paramRepeatBonus?: number },
): GameState {
  switch (e.kind) {
    case 'param': {
      const base = e.value ?? 0
      // 強気倍率 (1.0 / 2.0 / 2.5) と paramBoostPct を加算で重畳
      const totalMult = aggressiveParamMult(s.stance) + s.paramBoostPct / 100
      // 発火回数 = note.count (パラメータ+N（M回） の M) + paramRepeatBonus (手札バフ)
      const baseCount = (e.note?.['count'] as number | undefined) ?? 1
      const buffCount = ctx?.paramRepeatBonus ?? 0
      const totalAttacks = baseCount + buffCount
      let state = s
      // 1回ごとに「param += floor(N × mult) + 現在ターン熱意」を加算
      // (ターン熱意は非消費なので state.passion は変わらない)
      for (let i = 0; i < totalAttacks; i++) {
        const gained = Math.floor(base * totalMult)
        state = { ...state, param: state.param + gained + state.passion }
      }
      return state
    }
    case 'param_up_pct':
      // パラメータ上昇量増加 +N% (ドリンク等)。以降の param 効果に追加 % を加算
      return { ...s, paramBoostPct: s.paramBoostPct + (e.value ?? 0) }
    case 'passion_add':
      // 「熱意追加+N」: 永続バフ (passionBuff) に加算
      return { ...s, passionBuff: s.passionBuff + (e.value ?? 0) }
    case 'passion_bonus_pct':
      return { ...s, passionGainBonusPct: s.passionGainBonusPct + (e.value ?? 0) }
    case 'hp_recover':
      return { ...s, hp: Math.min(s.maxHp, s.hp + (e.value ?? 0)) }
    case 'hp_damage':
      return { ...s, hp: Math.max(0, s.hp - (e.value ?? 0)) }
    case 'genki':
      return { ...s, genki: s.genki + (e.value ?? 0) }
    case 'full_power':
      return { ...s, fullPower: s.fullPower + (e.value ?? 0) }
    case 'param_boost': {
      // 「パラメータ値増加+N」: 簡易実装として param へ加算 (強気倍率は乗じない)
      return { ...s, param: s.param + (e.value ?? 0) }
    }
    case 'extra_use':
    case 'extra_turn':
      return { ...s, cardsPlayableThisTurn: s.cardsPlayableThisTurn + (e.value ?? 0) }
    case 'state_change': {
      const to = (e.note?.['to'] as string | undefined) ?? ''
      const lvRaw = e.note?.['level']
      const cardLevel = typeof lvRaw === 'number' ? lvRaw : 1

      // アノマリーで意味があるのは 強気 / 温存 のみ
      if (to !== '強気' && to !== '温存') return s  // 好調等は no-op

      const targetKind: StanceKind = to === '強気' ? 'aggressive' : 'conserve'

      // 同種スタンスを重ね打ちした場合は段階 +1 (上限 2)
      // 異種への切替時はカードの段階指定をそのまま採用
      const newLevel =
        s.stance.kind === targetKind
          ? Math.min(2, s.stance.level + 1)
          : cardLevel

      // 温存解除時 (conserve → non-conserve) に各種バフが発火
      // Wiki 公式:
      //   熱意 = ceil((熱意追加 + N) × 熱意増加)
      //     N = 温存1段階=5, 温存2段階=8, のんびり(温存3段階)=10
      //   ・スキルカード使用数追加 +1 (全段階共通)
      //   ・固定元気 +5 (温存2段階以上)
      let passion = s.passion
      let genki = s.genki
      let cardsPlayableThisTurn = s.cardsPlayableThisTurn
      const wasConserve = s.stance.kind === 'conserve'
      const toNonConserve = targetKind !== 'conserve'
      if (wasConserve && toNonConserve) {
        const lv = s.stance.level
        const N =
          lv >= 3
            ? PASSION_GAIN_FROM_CONSERVE_LV3
            : lv >= 2
              ? PASSION_GAIN_FROM_CONSERVE_LV2
              : PASSION_GAIN_FROM_CONSERVE_LV1
        const gained = Math.ceil((s.passionBuff + N) * (1 + s.passionGainBonusPct / 100))
        passion += gained
        cardsPlayableThisTurn += RELEASE_EXTRA_USE
        if (lv >= 2) {
          genki += RELEASE_FIXED_GENKI_LV2_PLUS
        }
      }

      return {
        ...s,
        stance: { kind: targetKind, level: newLevel },
        passion,
        genki,
        cardsPlayableThisTurn,
      }
    }
    case 'hand_param_boost': {
      // 「手札のパラメータ上昇回数増加+N」: 現在手札の全カードに paramRepeatBonus +N を付与
      const n = e.value ?? 0
      const newHand = s.hand.map((c) => ({
        ...c,
        paramRepeatBonus: (c.paramRepeatBonus ?? 0) + n,
      }))
      return { ...s, hand: newHand }
    }
    // アノマリー外ステータス: no-op
    case 'good_impression':
    case 'good_impression_turns':
    case 'good_condition':
    case 'great_condition':
    case 'motivation':
    case 'concentration':
    case 'discard':
    case 'discard_all':
    case 'draw':
    case 'no_effect':
      return s
  }
  return s
}

/** カード1枚プレイの完全な遷移 (ドロー分岐展開込み) */
export function playCard(
  state: GameState,
  cardRef: CardRef,
  catalog: CardCatalog,
): SuccessorState[] {
  const card = catalog.byId.get(cardRef.cardId)
  if (!card) return []
  const variant = card.variants.find((v) => v.level === cardRef.level)
  if (!variant) return []

  // 0) コスト消費 (HP: 元気で吸収 / 全力値: 直接消費)
  //    各カスタムフラグでカテゴリ別に無効化可能。
  let s = cloneState(state)
  // HP コスト: customRemoveHpCost で完全削除、customHpCostReduction で減算
  if (!cardRef.customRemoveHpCost) {
    const rawHpCost = variant.cost.hp ?? 0
    const hpCost = Math.max(0, rawHpCost - (cardRef.customHpCostReduction ?? 0))
    if (hpCost > 0) {
      const absorbed = Math.min(s.genki, hpCost)
      s = { ...s, genki: s.genki - absorbed, hp: s.hp - (hpCost - absorbed) }
    }
  }
  // 全力値コスト: customRemoveFullPowerCost で完全削除
  if (!cardRef.customRemoveFullPowerCost) {
    const fpCost = variant.cost.full_power ?? 0
    if (fpCost > 0) {
      s = { ...s, fullPower: Math.max(0, s.fullPower - fpCost) }
    }
  }

  // 1) 手札から該当カード除去
  const idx = s.hand.findIndex((h) => h.instanceId === cardRef.instanceId)
  if (idx >= 0) s.hand.splice(idx, 1)

  // 2) 効果適用 (ドロー / 手札捨て以外)
  // paramRepeatBonus = hand_param_boost 由来 + customExtraParamRepeats (成長効果事前適用)
  const totalRepeatBonus =
    (cardRef.paramRepeatBonus ?? 0) + (cardRef.customExtraParamRepeats ?? 0)
  const nonHandOp = variant.effects.filter(
    (e) => e.kind !== 'draw' && e.kind !== 'discard' && e.kind !== 'discard_all',
  )
  s = applyEffectsInline(s, nonHandOp, { paramRepeatBonus: totalRepeatBonus })

  // 3) 手札捨て効果
  for (const e of variant.effects) {
    if (e.kind === 'discard_all') {
      s.discard.push(...s.hand)
      s.hand = []
    } else if (e.kind === 'discard') {
      const n = e.value ?? 1
      const removed = s.hand.splice(0, n)
      s.discard.push(...removed)
    }
  }

  // 4) プレイ済みカードを 除外 / 捨て札 に振り分け
  //    once_per_lesson (備考に「レッスン中1回」) → 除外 (デッキ復帰しない)
  //    reusable                                  → 捨て札 (枯渇時に再シャッフル)
  //    customNoExile が true なら once_per_lesson でも捨て札に回す (再利用可)
  if (card.usage === 'once_per_lesson' && !cardRef.customNoExile) {
    s.removed.push(cardRef)
  } else {
    s.discard.push(cardRef)
  }

  // 5) カード使用回数を消費
  s = {
    ...s,
    cardsPlayableThisTurn: s.cardsPlayableThisTurn - 1,
    playedThisTurn: [...s.playedThisTurn, cardRef.instanceId],
  }

  // 6) ドロー効果を確率分岐
  const totalDraw = variant.effects
    .filter((e) => e.kind === 'draw')
    .reduce((sum, e) => sum + (e.value ?? 0), 0)

  if (totalDraw <= 0) {
    return [{ state: s, probability: 1.0 }]
  }
  return expandDraws(s, totalDraw)
}

function expandDraws(state: GameState, n: number): SuccessorState[] {
  let results: SuccessorState[] = [{ state, probability: 1.0, drawnCards: [] }]
  for (let i = 0; i < n; i++) {
    const next: SuccessorState[] = []
    for (const cur of results) {
      const drawn = drawOneStep(cur.state)
      for (const d of drawn) {
        next.push({
          state: d.state,
          probability: cur.probability * d.probability,
          drawnCards:
            d.drawnCards && d.drawnCards.length > 0
              ? [...(cur.drawnCards ?? []), ...d.drawnCards]
              : cur.drawnCards ?? [],
        })
      }
    }
    results = next
  }
  return results
}

/**
 * Pドリンクをプレイ。カードと違って:
 *  - 使用後は drinks リストから消費される (除外/捨て札は無関係)
 *  - cardsPlayableThisTurn を消費しない (無料アクション)
 *  - ドロー効果があれば確率分岐
 */
export function playDrink(
  state: GameState,
  drinkRef: DrinkRef,
  drinkCatalog: DrinkCatalog,
): SuccessorState[] {
  const drink = drinkCatalog.byId.get(drinkRef.drinkId)
  if (!drink) return []

  // 0) コスト (HP 消費、元気で吸収)
  let s = cloneState(state)
  const hpCost = drink.cost.hp ?? 0
  if (hpCost > 0) {
    const absorbed = Math.min(s.genki, hpCost)
    s = { ...s, genki: s.genki - absorbed, hp: s.hp - (hpCost - absorbed) }
  }

  // 1) 保持リストから除去
  const idx = s.drinks.findIndex((d) => d.instanceId === drinkRef.instanceId)
  if (idx >= 0) s.drinks.splice(idx, 1)

  // 2) ドロー以外の効果を適用
  const nonDraw = drink.effects.filter((e) => e.kind !== 'draw')
  s = applyEffectsInline(s, nonDraw)

  // 3) ドロー効果を確率分岐
  const totalDraw = drink.effects
    .filter((e) => e.kind === 'draw')
    .reduce((sum, e) => sum + (e.value ?? 0), 0)

  if (totalDraw <= 0) {
    return [{ state: s, probability: 1.0 }]
  }
  return expandDraws(s, totalDraw)
}

function drawOneStep(state: GameState): SuccessorState[] {
  let s = state
  if (s.deck.length === 0) s = reshuffleDiscardIntoDeck(s)
  if (s.deck.length === 0) return [{ state: s, probability: 1.0, drawnCards: [] }]
  const groups = new Map<string, { ref: CardRef; count: number }>()
  for (const cr of s.deck) {
    const key = `${cr.cardId}#${cr.level}`
    const g = groups.get(key)
    if (g) g.count++
    else groups.set(key, { ref: cr, count: 1 })
  }
  const total = s.deck.length
  const out: SuccessorState[] = []
  for (const { ref, count } of groups.values()) {
    const ns = cloneState(s)
    const idx = ns.deck.findIndex((c) => c.cardId === ref.cardId && c.level === ref.level)
    if (idx >= 0) ns.deck.splice(idx, 1)
    ns.hand.push(ref)
    out.push({ state: ns, probability: count / total, drawnCards: [ref] })
  }
  return out
}
