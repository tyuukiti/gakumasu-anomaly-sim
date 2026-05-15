/**
 * 保持ドリンクの追加・一覧表示 (Pドリンクは1ターン中に消費される)
 */
import { useSimulatorStore, newInstanceId } from '../../stores/simulatorStore'

export default function DrinkPicker() {
  const drinkCatalog = useSimulatorStore((s) => s.drinkCatalog)
  const heldDrinks = useSimulatorStore((s) => s.heldDrinks)
  const addDrink = useSimulatorStore((s) => s.addDrink)
  const removeDrink = useSimulatorStore((s) => s.removeDrink)
  const clearDrinks = useSimulatorStore((s) => s.clearDrinks)

  if (!drinkCatalog) return null

  return (
    <div className="border rounded p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold">
          保持ドリンク <span className="text-gray-500 text-xs">({heldDrinks.length}個)</span>
        </h2>
        {heldDrinks.length > 0 && (
          <button
            onClick={clearDrinks}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            全削除
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {drinkCatalog.list.map((d) => (
          <button
            key={d.id}
            onClick={() => addDrink({ drinkId: d.id, instanceId: newInstanceId() })}
            className="px-2 py-1 text-xs border rounded hover:bg-indigo-50"
            title={d.remark}
          >
            <span className={`mr-1 rarity-${d.rarity}`}>[{d.rarity}]</span>
            🥤 {d.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 min-h-[1.75rem]">
        {heldDrinks.length === 0 && (
          <span className="text-gray-400 text-xs">（ボタンを押して保持ドリンクを追加）</span>
        )}
        {heldDrinks.map((dr) => {
          const d = drinkCatalog.byId.get(dr.drinkId)
          return (
            <span
              key={dr.instanceId}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs"
              title={d?.remark}
            >
              <span>🥤 {d?.name ?? dr.drinkId}</span>
              <button
                onClick={() => removeDrink(dr.instanceId)}
                className="text-gray-400 hover:text-red-600"
                aria-label="削除"
              >
                ×
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}
