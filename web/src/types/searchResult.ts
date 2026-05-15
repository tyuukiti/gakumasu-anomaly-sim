/** 最終ターン探索の結果型 */
import type { CardRef } from './gameState'

/** プレイ後のステータススナップショット (デバッグ可視化用) */
export interface StateSnapshot {
  param: number
  passion: number
  passionBuff: number
  passionGainBonusPct: number
  paramBoostPct: number
  hp: number
  genki: number
  fullPower: number
  stanceLabel: string  // "中立" / "温存1" / "温存2" / "強気1" / "強気2"
  cardsPlayableThisTurn: number
}

/** ドローで引いたカード1枚分の情報 */
export interface DrawnCardInfo {
  cardId: string
  level: string
  cardName: string
}

/** 1プレイ手番のサマリ */
export interface MoveStep {
  cardRef: CardRef
  cardName: string
  /** プレイ後の累積スコア (期待値ではなく実数値) */
  scoreAfter: number
  /** プレイ後の状態スナップショット */
  stateAfter: StateSnapshot
  /** このプレイで実際にドローされたカード一覧 (確率分岐の中で選ばれた具体的な引き結果) */
  drawnCards?: DrawnCardInfo[]
  /** このプレイで違うカードを引いた場合の代替分岐 (最適続き+最終スコア) */
  alternatives?: StepAlternative[]
}

/** ドロー失敗時の代替分岐 */
export interface StepAlternative {
  /** この代替で引いたカード */
  drawnCards: DrawnCardInfo[]
  /** この代替の発生確率 (元のドローの分布における) */
  probability: number
  /** 代替を選んだ後の最適続き */
  continuation: MoveStep[]
  /** 代替の最終スコア (最良ケース) */
  bestScore: number
}

/** 1探索結果 = 1プレイ順 */
export interface SearchPattern {
  /** このパターンの一連のプレイ順 (期待値最大の代表系列) */
  steps: MoveStep[]
  /** 期待スコア (このパターン到達条件下での平均、確率重み) */
  expectedScore: number
  /** 最良ケースのスコア (運が最大限味方した場合) */
  bestScore: number
  /** 最悪ケースのスコア */
  worstScore: number
  /** このプレイ順が成立する確率 (ドロー運込み)。1.0 なら確定 */
  patternProbability: number
  /** 確率 × 期待スコア (パターン全体の期待寄与) */
  unconditionalExpected: number
  /** 分岐サンプル (ドロー運によって変わりうる代替系列、最大3件) */
  branchSamples: { description: string; score: number; probability: number }[]
}

/** 探索エンジンの出力 */
export interface SearchResult {
  patterns: SearchPattern[]
  /** 探索した葉ノード数 (パフォーマンス確認用) */
  exploredLeafCount: number
  /** 枝刈り回数 */
  prunedCount: number
  /** 計算所要 ms */
  elapsedMs: number
}
