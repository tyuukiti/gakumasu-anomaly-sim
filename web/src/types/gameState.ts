/**
 * 最終ターン探索で扱うゲーム状態 (アノマリーモード専用)
 *
 * アノマリー仕様:
 *   - スタンス: 中立 / 温存(1段階・2段階) / 強気(1段階・2段階)
 *   - 温存 N段階 → 強気 への遷移時に 熱意 += (5 or 8) × (1 + 熱意上昇量ボーナス%/100)
 *       * 温存1段階 → 強気: 基礎値 5
 *       * 温存2段階 → 強気: 基礎値 8
 *   - 強気状態でのカード「パラメータ+N」効果は倍率を受ける
 *       * 強気1段階: ×2.0 (+100%)
 *       * 強気2段階: ×2.5 (+150%)
 *   - 累積熱意は最終スコアにパラメータと単純加算される (score = floor(param + passion))
 */

import type { EnhanceLevel } from './card'
import type { DrinkRef } from './drink'

/** 手札・デッキ内の1枚を表す参照 */
export interface CardRef {
  cardId: string
  level: EnhanceLevel
  /** UI 上で同名カードを区別する一意キー */
  instanceId: string
  /** 「手札のパラメータ上昇回数増加+N」(hand_param_boost) で付与された個別バフ。
   *  カードがプレイされた時、param 効果1個あたりの発火回数に追加される。 */
  paramRepeatBonus?: number

  // ---- ユーザーによる事前カスタマイズ (Data/AnomalyCards/customizations.yaml で定義) ----
  /** 「レッスン中1回」を上書きして再利用可に */
  customNoExile?: boolean
  /** HP コストを 0 にする */
  customRemoveHpCost?: boolean
  /** 全力値コストを 0 にする */
  customRemoveFullPowerCost?: boolean
  /** 成長効果等で事前に上昇回数バフ +N をプレイ時に追加 */
  customExtraParamRepeats?: number
  /** 成長効果等で HP コストを N 減 (実コスト = max(0, raw - N)) */
  customHpCostReduction?: number
}

/** プレイヤーの現在スタンス種別 */
export type StanceKind = 'neutral' | 'aggressive' | 'conserve'

/** スタンス (種別 + 段階) */
export interface Stance {
  kind: StanceKind
  /** 1 or 2 (neutral では 0) */
  level: number
}

export interface GameState {
  hand: CardRef[]
  deck: CardRef[]
  discard: CardRef[]
  /** 使用後に除外されたカード (usage='once_per_lesson')。デッキ再シャッフル対象外。 */
  removed: CardRef[]

  /** 体力 */
  hp: number
  /** 最大体力 */
  maxHp: number

  /** 累積パラメータ (スコア素点) */
  param: number

  /** ターン熱意 (そのターンのみ有効、温存→強気遷移と passion_add で累積、アタックで param へ加算) */
  passion: number

  /** 熱意バフ (ゲーム中永続。温存→強気遷移時の基礎値に加算される定数。UI 入力およびカード「熱意追加+N」で増加) */
  passionBuff: number

  /** 元気 (HP消費を吸収する盾) */
  genki: number
  /** 全力値 (アノマリー固有、累積値) */
  fullPower: number

  /** 現在のスタンス */
  stance: Stance

  /** 熱意上昇量ボーナス % (温存→強気遷移時の熱意ゲインに % 加算) */
  passionGainBonusPct: number

  /** パラメータ上昇量ボーナス % (param 効果に対する追加 %、強気倍率と加算で重畳) */
  paramBoostPct: number

  /** 保持中のPドリンク (使用すると消費) */
  drinks: DrinkRef[]

  /** 今ターン残りスキルカード使用回数 */
  cardsPlayableThisTurn: number

  /** デバッグ/履歴 */
  playedThisTurn: string[]
}

/** ユーザー入力 (UI の StatusInput) から GameState の初期値を作る用
 *
 * ※ 「ターン熱意 (passion)」はターン開始時に 0 リセットされる仕様のため UI 入力不要。
 *    UI に出すのは恒久バフの passionBuff のみ。
 */
export interface StatusInputValues {
  hp: number
  maxHp: number
  genki: number
  fullPower: number
  passionBuff: number
  stance: Stance
  passionGainBonusPct: number
  paramBoostPct: number
  cardsPlayableThisTurn: number
}
