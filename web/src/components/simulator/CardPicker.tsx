/**
 * カードカタログから検索し、リストクリックでゾーンに即追加するUI。
 * 強化レベルは画面上部のセレクタで決定 (デフォルト +)。
 */
import { useMemo, useState } from 'react'
import type { Card, EnhanceLevel } from '../../types/card'
import { useSimulatorStore, newInstanceId } from '../../stores/simulatorStore'

interface Props {
  zone: 'hand' | 'deck' | 'discard'
  zoneLabel: string
}

// 強化は無印・+ のみ考慮 (++ / +++ は確率的なカスタム強化のためシミュ対象外)
const LEVEL_CHOICES: EnhanceLevel[] = ['無印', '+']

export default function CardPicker({ zone, zoneLabel }: Props) {
  const catalog = useSimulatorStore((s) => s.catalog)
  const addToZone = useSimulatorStore((s) => s.addToZone)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<EnhanceLevel>('+')
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const matches = useMemo<Card[]>(() => {
    if (!catalog) return []
    return catalog.search(query).slice(0, 30)
  }, [catalog, query])

  const handleAdd = (card: Card) => {
    const availableLevels = card.variants.map((v) => v.level)
    const useLevel: EnhanceLevel = availableLevels.includes(level)
      ? level
      : (availableLevels[0] ?? '+')
    addToZone(zone, {
      cardId: card.id,
      level: useLevel,
      instanceId: newInstanceId(),
    })
    // 軽い視覚フィードバック (一瞬背景色を変える)
    setLastAdded(card.id)
    setTimeout(() => setLastAdded((cur) => (cur === card.id ? null : cur)), 300)
  }

  return (
    <div className="border rounded p-2 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${zoneLabel}に追加するカード名で検索...`}
          className="border rounded px-2 py-1 flex-1 text-sm"
        />
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as EnhanceLevel)}
          className="border rounded px-2 py-1 text-sm"
          title="追加する強化レベル"
        >
          {LEVEL_CHOICES.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>
      </div>
      <div className="max-h-40 overflow-y-auto border rounded divide-y text-sm">
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => handleAdd(c)}
            title="クリックで追加"
            className={`w-full text-left px-2 py-1 transition-colors ${
              lastAdded === c.id ? 'bg-green-100' : 'hover:bg-gray-100'
            }`}
          >
            <span className={`mr-2 text-xs rarity-${c.rarity}`}>[{c.rarity}]</span>
            <span className={`mr-2 text-xs px-1 rounded chip-${c.category}`}>
              {c.category === 'free'
                ? 'フリー'
                : c.category === 'anomaly'
                  ? 'アノマリー'
                  : c.category === 'trouble'
                    ? 'トラブル'
                    : '固有'}
            </span>
            <span>{c.name}</span>
            {c.owner && (
              <span className="ml-2 text-[10px] text-gray-500">@{c.owner}</span>
            )}
          </button>
        ))}
        {matches.length === 0 && (
          <div className="text-gray-400 text-xs px-2 py-1">該当カードなし</div>
        )}
      </div>
    </div>
  )
}
