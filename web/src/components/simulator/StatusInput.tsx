/**
 * アノマリーモードの現在ステータス入力
 *  - 体力 / 最大体力 / 元気 / 全力値 / 熱意 / 熱意上昇量ボーナス%
 *  - スタンス (中立 / 温存1段階 / 温存2段階 / 強気1段階 / 強気2段階)
 *  - 残りスキルカード使用回数
 */
import { useSimulatorStore } from '../../stores/simulatorStore'
import type { StatusInputValues, Stance } from '../../types/gameState'

interface NumField {
  key: Exclude<keyof StatusInputValues, 'stance'>
  label: string
  hint?: string
}

// 体力 / 最大体力 / 元気 / 全力値 はスコアに影響しないため UI 非表示
// (内部的には DEFAULT_STATUS の値で動作)
const NUM_FIELDS: NumField[] = [
  { key: 'passionBuff', label: '熱意追加' },
  { key: 'passionGainBonusPct', label: '熱意増加 %' },
  { key: 'paramBoostPct', label: 'パラメータ上昇量増加 %' },
  { key: 'cardsPlayableThisTurn', label: '残りスキルカード使用数' },
]

const STANCE_OPTIONS: { value: Stance; label: string }[] = [
  { value: { kind: 'neutral', level: 0 }, label: '中立' },
  { value: { kind: 'conserve', level: 1 }, label: '温存 1段階' },
  { value: { kind: 'conserve', level: 2 }, label: '温存 2段階' },
  { value: { kind: 'aggressive', level: 1 }, label: '強気 1段階' },
  { value: { kind: 'aggressive', level: 2 }, label: '強気 2段階' },
]

function stanceKey(s: Stance): string {
  return `${s.kind}-${s.level}`
}

export default function StatusInput() {
  const status = useSimulatorStore((s) => s.status)
  const updateStatus = useSimulatorStore((s) => s.updateStatus)

  return (
    <div className="border rounded p-3 bg-white">
      <h2 className="font-bold mb-2">現在のステータス（アノマリー）</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {NUM_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col text-xs">
            <span className="text-gray-600 truncate" title={f.label}>
              {f.label}
              {f.hint && <span className="text-gray-400 ml-1">({f.hint})</span>}
            </span>
            <input
              type="number"
              value={status[f.key]}
              onChange={(e) => updateStatus({ [f.key]: Number(e.target.value) || 0 })}
              className="border rounded px-2 py-1 mt-0.5 text-sm w-full"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="text-gray-600 text-xs">スタンス:</span>
        {STANCE_OPTIONS.map((opt) => (
          <label key={stanceKey(opt.value)} className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="stance"
              value={stanceKey(opt.value)}
              checked={stanceKey(status.stance) === stanceKey(opt.value)}
              onChange={() => updateStatus({ stance: opt.value })}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
