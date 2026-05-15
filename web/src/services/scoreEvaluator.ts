/**
 * 最終ターン到達状態 → スコア (アノマリーモード版)
 *
 * 仕様:
 *   - 熱意は effectExecutor 側でアタックカード使用時に都度 param へ加算済み
 *     (熱意自体は消費されないので、次のアタックでも再度加算される)
 *   - 強気倍率は param 効果の獲得時に既に乗じられている (effectExecutor)
 *
 * 最終スコア = floor(param)
 * (passion は score には直接加算しない。アタックで使われなかった熱意は活用されなかったとみなす)
 */
import type { GameState } from '../types/gameState'

export interface ScoreBreakdown {
  param: number
  passion: number
  total: number
}

export function evaluateScore(state: GameState): ScoreBreakdown {
  const param = state.param
  const passion = state.passion
  const total = Math.floor(param)
  return { param, passion, total }
}
