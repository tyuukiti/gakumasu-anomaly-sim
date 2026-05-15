/**
 * GameState のヘルパ (immutable な状態更新ユーティリティ)
 */
import type { GameState, CardRef, StatusInputValues } from '../types/gameState'
import type { DrinkRef } from '../types/drink'

export function makeInitialState(
  hand: CardRef[],
  deck: CardRef[],
  discard: CardRef[],
  status: StatusInputValues,
  drinks: DrinkRef[] = [],
): GameState {
  return {
    hand: [...hand],
    deck: [...deck],
    discard: [...discard],
    removed: [],
    hp: status.hp,
    maxHp: status.maxHp,
    param: 0,
    // ターン熱意は毎ターン 0 から開始
    passion: 0,
    passionBuff: status.passionBuff,
    genki: status.genki,
    fullPower: status.fullPower,
    stance: { ...status.stance },
    passionGainBonusPct: status.passionGainBonusPct,
    paramBoostPct: status.paramBoostPct,
    drinks: [...drinks],
    cardsPlayableThisTurn: status.cardsPlayableThisTurn,
    playedThisTurn: [],
  }
}

/** 浅いコピー (探索中の状態分岐用)。配列フィールドは別配列に複製。 */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    hand: [...s.hand],
    deck: [...s.deck],
    discard: [...s.discard],
    removed: [...s.removed],
    drinks: [...s.drinks],
    stance: { ...s.stance },
    playedThisTurn: [...s.playedThisTurn],
  }
}

/** デッキ空時、捨て札をシャッフルしデッキ化したコピーを返す。 */
export function reshuffleDiscardIntoDeck(s: GameState): GameState {
  if (s.deck.length > 0) return s
  if (s.discard.length === 0) return s
  return {
    ...s,
    deck: [...s.discard],
    discard: [],
  }
}
