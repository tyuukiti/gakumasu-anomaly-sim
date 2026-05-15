import { useState } from 'react'
import { useSimulatorStore } from '../stores/simulatorStore'
import CardPicker from '../components/simulator/CardPicker'
import ZoneDisplay from '../components/simulator/ZoneDisplay'
import StatusInput from '../components/simulator/StatusInput'
import DrinkPicker from '../components/simulator/DrinkPicker'
import ResultPanel from '../components/simulator/ResultPanel'

export default function SimulatorPage() {
  const runSearch = useSimulatorStore((s) => s.runSearch)
  const resetAll = useSimulatorStore((s) => s.resetAll)
  const exportState = useSimulatorStore((s) => s.exportState)
  const importState = useSimulatorStore((s) => s.importState)
  const hand = useSimulatorStore((s) => s.hand)
  const isSearching = useSimulatorStore((s) => s.isSearching)
  const cards = useSimulatorStore((s) => s.cards)
  const [copyMsg, setCopyMsg] = useState<string>('')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')

  const handleCopy = async () => {
    const text = exportState()
    try {
      await navigator.clipboard.writeText(text)
      setCopyMsg('クリップボードにコピーしました')
    } catch {
      // フォールバック: テキストエリア経由
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyMsg('クリップボードにコピーしました (fallback)')
    }
    setTimeout(() => setCopyMsg(''), 2000)
  }

  const handleImport = () => {
    const r = importState(importText)
    if (r.ok) {
      setShowImport(false)
      setImportText('')
      setCopyMsg('状態を復元しました')
    } else {
      setCopyMsg(`復元失敗: ${r.error}`)
    }
    setTimeout(() => setCopyMsg(''), 3000)
  }

  return (
    <div className="space-y-4">
      <section className="text-sm text-gray-600">
        <p>
          現在の<strong>手札</strong>・<strong>デッキ</strong>・<strong>捨て札</strong>と
          <strong>ステータス</strong>を入力して「探索」を押すと、最終ターンに取りうる
          プレイ順を全探索し、期待スコア上位 2 パターン + 最安定 1 パターンを表示します。
        </p>
        <p className="text-xs text-gray-500 mt-1">
          カードデータ: {cards.length} 枚を読み込み済み (フリー / アノマリー / トラブル)
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <h2 className="font-bold">手札</h2>
          <CardPicker zone="hand" zoneLabel="手札" />
          <ZoneDisplay zone="hand" label="手札" />
        </div>
        <div className="space-y-3">
          <h2 className="font-bold">デッキ</h2>
          <CardPicker zone="deck" zoneLabel="デッキ" />
          <ZoneDisplay zone="deck" label="デッキ" />
        </div>
        <div className="space-y-3">
          <h2 className="font-bold">捨て札</h2>
          <CardPicker zone="discard" zoneLabel="捨て札" />
          <ZoneDisplay zone="discard" label="捨て札" />
        </div>
      </section>

      <DrinkPicker />

      <StatusInput />

      <section className="flex items-center gap-3 flex-wrap">
        <button
          onClick={runSearch}
          disabled={isSearching || hand.length === 0}
          className="bg-[var(--color-accent)] text-white px-5 py-2 rounded font-bold disabled:opacity-40"
        >
          {isSearching ? '探索中...' : '🔍 最適ムーブを探索'}
        </button>
        <button
          onClick={resetAll}
          className="border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50"
        >
          全リセット
        </button>
        <button
          onClick={handleCopy}
          className="border border-gray-300 px-3 py-2 rounded text-sm hover:bg-gray-50"
          title="現在の手札/デッキ/捨て札/ドリンク/ステータス/カスタムをJSONとしてクリップボードへ"
        >
          📋 状態をコピー
        </button>
        <button
          onClick={() => setShowImport((v) => !v)}
          className="border border-gray-300 px-3 py-2 rounded text-sm hover:bg-gray-50"
          title="JSONを貼り付けて状態を復元"
        >
          📥 状態を貼付
        </button>
        {copyMsg && (
          <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
            {copyMsg}
          </span>
        )}
      </section>

      {showImport && (
        <section className="border rounded p-2 bg-amber-50">
          <p className="text-xs text-gray-600 mb-1">
            「状態をコピー」で得た JSON をここに貼り付けて「復元」を押してください。
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs font-mono"
            rows={6}
            placeholder='{"version": 1, "status": {...}, "hand": [...], ...}'
          />
          <div className="mt-1 flex gap-2">
            <button
              onClick={handleImport}
              className="bg-[var(--color-accent)] text-white px-3 py-1 rounded text-sm"
              disabled={!importText.trim()}
            >
              復元
            </button>
            <button
              onClick={() => { setShowImport(false); setImportText('') }}
              className="border border-gray-300 px-3 py-1 rounded text-sm"
            >
              閉じる
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-bold mb-2">探索結果 (期待スコア上位2 + 最安定1)</h2>
        <ResultPanel />
      </section>
    </div>
  )
}
