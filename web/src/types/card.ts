/**
 * カード定義型 (Data/AnomalyCards/*.yaml のスキーマと対応)
 *
 * - id:   "com_F_N_A_0001" 等 wiki ID
 * - category: "free" / "anomaly" / "trouble"
 * - variants: 強化レベル 4 段階 (無印 / + / ++ / +++) 別の効果
 */

export type Category = 'free' | 'anomaly' | 'trouble' | 'pidol'
export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'Leg'
export type CardType = 'active' | 'mental' | 'trouble' | 'unknown'
export type EnhanceLevel = '無印' | '+' | '++' | '+++'

/** 効果1つ分 (effect_parser.py の ParsedEffect と対応) */
export type EffectKind =
  | 'param'                  // パラメータ +N (強気スタンス + paramBoostPct で倍率乗算)
  | 'good_impression'        // (本編用、アノマリーでは no-op)
  | 'good_impression_turns'
  | 'good_condition'
  | 'great_condition'
  | 'motivation'
  | 'concentration'
  | 'genki'                  // 元気 +N
  | 'hp_recover'             // 体力 +N
  | 'hp_damage'              // 体力 -N
  | 'draw'                   // カードを N 枚引く
  | 'discard'                // 手札を N 枚捨てる
  | 'discard_all'            // 手札を全て捨てる
  | 'full_power'             // 全力値 +N
  | 'passion_add'            // 熱意追加 +N (累積熱意に直接加算)
  | 'passion_bonus_pct'      // 熱意増加 +N% (熱意上昇量ボーナス % を増加)
  | 'param_up_pct'           // パラメータ上昇量増加 +N% (強気倍率と加算で重畳、ドリンク等)
  | 'param_boost'            // パラメータ値増加 +N (簡易実装)
  | 'hand_param_boost'       // 手札のパラメータ上昇回数増加 +N (簡易実装)
  | 'extra_use'              // スキルカード使用数追加 +N
  | 'extra_turn'             // ターン追加 +N
  | 'state_change'           // 状態を変更 (note.to + note.level)
  | 'no_effect'              // 効果なし

export interface CardEffect {
  kind: EffectKind
  value?: number
  /**
   * 効果固有のメタデータ。
   * - state_change: { to: '強気' | '温存' | ..., level: 1 | 2 }
   */
  note?: Record<string, unknown>
}

export interface CardVariant {
  level: EnhanceLevel
  cost: { hp?: number; full_power?: number; raw?: string }
  effects: CardEffect[]
  raw_effect_text?: string
  unparsed_lines?: string[]
}

/**
 * 使用後の挙動。
 *  - once_per_lesson: 使用後に除外 (デッキ復帰しない)。備考に「レッスン中1回」を含むカード。
 *  - reusable:        使用後は捨て札へ。デッキ枯渇時に再シャッフルで再利用可。
 */
export type UsageRule = 'once_per_lesson' | 'reusable'

export interface Card {
  id: string
  name: string
  category: Category
  rarity: Rarity
  type: CardType
  custom_limit: string
  remark: string
  usage: UsageRule
  variants: CardVariant[]
  /** P-Idol固有 / SP固有 のとき、所属キャラ名 or 親サポートカード名 */
  owner?: string
  _needs_review?: boolean
}

/** YAML ファイルのトップレベル構造 */
export interface CardsYamlFile {
  cards: Card[]
}
