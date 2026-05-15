/**
 * カード固有のカスタマイズオプション定義 (customizations.yaml と対応)
 *
 * 各カードに固有のカスタマイズ項目を定義する。
 * UI はカードIDで該当オプションを引き、それだけを表示する。
 */
import type { CardRef } from './gameState'

/**
 * apply に書ける値のフィールド。
 *   - 各 boolean / number → CardRef の対応する custom* フィールドへ反映
 *   - *Per: counter 系のとき 1 ステップあたり加算される値
 */
export interface CardCustomizationApply {
  noExile?: boolean
  removeHpCost?: boolean
  removeFullPowerCost?: boolean
  /** counter 1 ぶんで paramRepeatBonus に加算される値 */
  paramRepeatBonusPer?: number
  /** counter 1 ぶんで hp コストを減らす値 */
  hpCostReductionPer?: number
}

export interface CardCustomizationOption {
  id: string
  label: string
  type: 'toggle' | 'counter'
  /** counter のときの最大値 (デフォルト: 1) */
  max?: number
  apply: CardCustomizationApply
  /** Wiki から抽出した段階毎の効果説明テキスト (UI 表示用) */
  effect_texts?: string[]
}

export interface CardCustomizationsFile {
  customizations: Record<string, { options: CardCustomizationOption[] }>
}

/** UI 側でのチェック状態を保持する型 (instance スコープ) */
export interface CardCustomizationState {
  /** option.id → 値 (toggle: boolean / counter: number) */
  values: Record<string, boolean | number>
}

/**
 * UI のチェック状態を CardRef の custom* フィールドへ集約する。
 */
export function applyCustomizationToCardRef(
  ref: CardRef,
  options: CardCustomizationOption[],
  state: CardCustomizationState | undefined,
): Partial<CardRef> {
  const out: Partial<CardRef> = {
    customNoExile: false,
    customRemoveHpCost: false,
    customRemoveFullPowerCost: false,
    customExtraParamRepeats: 0,
    customHpCostReduction: 0,
  }
  if (!state) return out
  for (const opt of options) {
    const v = state.values[opt.id]
    if (opt.type === 'toggle' && v === true) {
      if (opt.apply.noExile) out.customNoExile = true
      if (opt.apply.removeHpCost) out.customRemoveHpCost = true
      if (opt.apply.removeFullPowerCost) out.customRemoveFullPowerCost = true
    } else if (opt.type === 'counter' && typeof v === 'number' && v > 0) {
      if (opt.apply.paramRepeatBonusPer) {
        out.customExtraParamRepeats =
          (out.customExtraParamRepeats ?? 0) + opt.apply.paramRepeatBonusPer * v
      }
      if (opt.apply.hpCostReductionPer) {
        out.customHpCostReduction =
          (out.customHpCostReduction ?? 0) + opt.apply.hpCostReductionPer * v
      }
    }
    // refからも参照: 暗黙の互換のため
    void ref
  }
  return out
}
