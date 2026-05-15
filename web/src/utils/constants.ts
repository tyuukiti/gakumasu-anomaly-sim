/**
 * アノマリーモード スコア計算の倍率・探索パラメータ
 */

// ---- 温存解除時の熱意ゲイン基礎値 N ----
// 公式: 熱意 = ceil((熱意追加 + N) × 熱意増加) ※小数点以下切り上げ
/** 温存1段階 解除時の基礎値 N */
export const PASSION_GAIN_FROM_CONSERVE_LV1 = 5
/** 温存2段階 解除時の基礎値 N */
export const PASSION_GAIN_FROM_CONSERVE_LV2 = 8
/** のんびり(温存3段階) 解除時の基礎値 N */
export const PASSION_GAIN_FROM_CONSERVE_LV3 = 10

// ---- 温存解除時の追加バフ ----
/** 温存解除時に必ず付与: スキルカード使用数追加 */
export const RELEASE_EXTRA_USE = 1
/** 温存2段階目以上の解除時に付与: 固定元気 */
export const RELEASE_FIXED_GENKI_LV2_PLUS = 5

// ---- 強気スタンスのパラメータ上昇量倍率 ----
/** 強気1段階: パラ上昇量 +100% → ×2.0 */
export const AGGRESSIVE_LV1_PARAM_MULT = 2.0
/** 強気2段階: パラ上昇量 +150% → ×2.5 */
export const AGGRESSIVE_LV2_PARAM_MULT = 2.5

// ---- 探索パラメータ ----
/** ドロー分岐の確率閾値。これ未満の枝は探索打ち切り */
export const PROBABILITY_EPSILON = 0.001
/** 葉ノードの最大数 (これを超えたら強制打ち切り) */
export const MAX_LEAVES = 200_000
/** 1探索パスの最大プレイ手数の上限 */
export const MAX_DEPTH_HARD = 8
/** 結果として返すパターン数: 期待スコア上位 (N-1) + 最安定 1 */
export const RESULT_PATTERN_COUNT = 3
