/**
 * 手札 / デッキ / 捨て札 のカード一覧表示
 *  - チップで各カードを表示
 *  - × で削除
 *  - ⚙ (カスタマイズ定義があるカードのみ) でカード固有のオプションを開く
 *
 *  カード毎のカスタマイズ選択肢は Data/AnomalyCards/customizations.yaml で定義し、
 *  store.customizationOptions にロード済み。
 */
import { useState } from 'react'
import { useSimulatorStore } from '../../stores/simulatorStore'
import type { CardRef } from '../../types/gameState'
import type { CardCustomizationOption } from '../../types/customization'

interface Props {
  zone: 'hand' | 'deck' | 'discard'
  label: string
}

/**
 * カードのカスタマイズ定義オプション (toggle/counter) → CardRef の現在値を取得
 */
function getOptionValue(cr: CardRef, opt: CardCustomizationOption): boolean | number {
  if (opt.type === 'toggle') {
    if (opt.apply.noExile) return !!cr.customNoExile
    if (opt.apply.removeHpCost) return !!cr.customRemoveHpCost
    if (opt.apply.removeFullPowerCost) return !!cr.customRemoveFullPowerCost
    return false
  }
  // counter
  if (opt.apply.paramRepeatBonusPer) {
    const per = opt.apply.paramRepeatBonusPer
    return Math.floor((cr.customExtraParamRepeats ?? 0) / per)
  }
  if (opt.apply.hpCostReductionPer) {
    const per = opt.apply.hpCostReductionPer
    return Math.floor((cr.customHpCostReduction ?? 0) / per)
  }
  return 0
}

/**
 * オプション 1 つを update したときに CardRef に反映する partial を作る
 */
function buildPartialUpdate(
  opt: CardCustomizationOption,
  newValue: boolean | number,
): Partial<CardRef> {
  if (opt.type === 'toggle') {
    const v = !!newValue
    const partial: Partial<CardRef> = {}
    if (opt.apply.noExile) partial.customNoExile = v
    if (opt.apply.removeHpCost) partial.customRemoveHpCost = v
    if (opt.apply.removeFullPowerCost) partial.customRemoveFullPowerCost = v
    return partial
  }
  // counter — counter のとき複数の per-keys がある可能性あり (paramRepeatBonusPer + hpCostReductionPer)
  const n = Math.max(0, Math.min(opt.max ?? 1, Number(newValue) || 0))
  const partial: Partial<CardRef> = {}
  if (opt.apply.paramRepeatBonusPer) {
    partial.customExtraParamRepeats = n * opt.apply.paramRepeatBonusPer
  }
  if (opt.apply.hpCostReductionPer) {
    partial.customHpCostReduction = n * opt.apply.hpCostReductionPer
  }
  return partial
}

export default function ZoneDisplay({ zone, label }: Props) {
  const cards = useSimulatorStore((s) => s[zone])
  const catalog = useSimulatorStore((s) => s.catalog)
  const customizationOptions = useSimulatorStore((s) => s.customizationOptions)
  const removeFromZone = useSimulatorStore((s) => s.removeFromZone)
  const clearZone = useSimulatorStore((s) => s.clearZone)
  const updateCardCustom = useSimulatorStore((s) => s.updateCardCustom)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="border rounded p-2 bg-white">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-sm">
          {label} <span className="text-gray-500 text-xs">({cards.length}枚)</span>
        </h3>
        {cards.length > 0 && (
          <button
            onClick={() => clearZone(zone)}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            全削除
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 min-h-[2rem]">
        {cards.length === 0 && <span className="text-gray-400 text-xs">（空）</span>}
        {cards.map((cr) => {
          const card = catalog?.byId.get(cr.cardId)
          const name = card ? card.name : cr.cardId
          const options = customizationOptions[cr.cardId] ?? []
          const customized =
            cr.customNoExile ||
            cr.customRemoveHpCost ||
            cr.customRemoveFullPowerCost ||
            (cr.customExtraParamRepeats ?? 0) > 0 ||
            (cr.customHpCostReduction ?? 0) > 0
          const isExile = card?.usage === 'once_per_lesson' && !cr.customNoExile
          const isEditing = editingId === cr.instanceId
          return (
            <div key={cr.instanceId} className="flex flex-col">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                <span title={card?.id} className="flex-1">
                  {name} <span className="text-gray-500">[{cr.level}]</span>
                  {isExile && (
                    <span className="ml-1 px-1 text-[10px] rounded bg-red-100 text-red-700">除外</span>
                  )}
                  {customized && (
                    <span className="ml-1 px-1 text-[10px] rounded bg-amber-100 text-amber-700">カスタム</span>
                  )}
                </span>
                {options.length > 0 && (
                  <button
                    onClick={() => setEditingId(isEditing ? null : cr.instanceId)}
                    className="text-gray-400 hover:text-indigo-600 text-[12px]"
                    aria-label="カスタマイズ"
                    title="カスタマイズ"
                  >
                    ⚙
                  </button>
                )}
                <button
                  onClick={() => removeFromZone(zone, cr.instanceId)}
                  className="text-gray-400 hover:text-red-600"
                  aria-label="削除"
                >
                  ×
                </button>
              </div>
              {isEditing && options.length > 0 && (
                <div className="ml-2 mt-1 mb-1 p-2 border border-amber-200 bg-amber-50 rounded text-[11px] space-y-2">
                  {options.map((opt) => {
                    const cur = getOptionValue(cr, opt)
                    const hasMechanical = Object.keys(opt.apply ?? {}).length > 0
                    return (
                      <div key={opt.id} className="border-b border-amber-200 last:border-b-0 pb-1">
                        <div className="flex items-center gap-1">
                          {opt.type === 'toggle' ? (
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!cur}
                                onChange={(e) =>
                                  updateCardCustom(
                                    zone,
                                    cr.instanceId,
                                    buildPartialUpdate(opt, e.target.checked),
                                  )
                                }
                              />
                              <span className="font-medium">{opt.label}</span>
                            </label>
                          ) : (
                            <>
                              <span className="font-medium">{opt.label}:</span>
                              <input
                                type="number"
                                min={0}
                                max={opt.max ?? 99}
                                value={typeof cur === 'number' ? cur : 0}
                                onChange={(e) =>
                                  updateCardCustom(
                                    zone,
                                    cr.instanceId,
                                    buildPartialUpdate(opt, Number(e.target.value) || 0),
                                  )
                                }
                                className="border rounded px-1 w-12"
                              />
                              <span className="text-gray-500">/ {opt.max ?? 99}</span>
                            </>
                          )}
                          {!hasMechanical && (
                            <span className="ml-1 px-1 text-[9px] bg-gray-200 text-gray-600 rounded" title="シミュレータでは効果未反映 (表示のみ)">
                              表示のみ
                            </span>
                          )}
                        </div>
                        {opt.effect_texts && opt.effect_texts.length > 0 && (
                          <ul className="ml-5 mt-0.5 text-gray-600 text-[10px] list-disc">
                            {opt.effect_texts.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
