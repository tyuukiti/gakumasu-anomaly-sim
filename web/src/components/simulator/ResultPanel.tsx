/**
 * 探索結果 (上位5パターン) の表示
 * 各ステップ後の状態 (熱意・スタンス・使用回数・体力・元気・全力値) を可視化してデバッグ可能にする
 */
import { useSimulatorStore } from '../../stores/simulatorStore'
import type { StateSnapshot } from '../../types/searchResult'
import { trackEvent } from '../../utils/analytics'

function StateLine({ s, prev }: { s: StateSnapshot; prev?: StateSnapshot }) {
  const diff = (cur: number, prv?: number) => {
    if (prv === undefined) return ''
    const d = cur - prv
    if (d === 0) return ''
    return d > 0 ? ` (+${d})` : ` (${d})`
  }
  const stanceDiff = prev && prev.stanceLabel !== s.stanceLabel ? ` ← ${prev.stanceLabel}` : ''
  // 体力 / 元気 / 全力値 はスコアに影響しないため表示省略
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-0.5 mt-1 ml-6 text-[11px] text-gray-700 bg-gray-50 rounded p-1.5">
      <span>
        <span className="text-gray-500">param:</span>{' '}
        <b className="text-indigo-700">{s.param}</b>
        <span className="text-gray-400">{diff(s.param, prev?.param)}</span>
      </span>
      <span>
        <span className="text-gray-500">熱意:</span>{' '}
        <b className="text-pink-700">{s.passion}</b>
        <span className="text-gray-400">{diff(s.passion, prev?.passion)}</span>
      </span>
      <span>
        <span className="text-gray-500">スタンス:</span>{' '}
        <b>{s.stanceLabel}</b>
        <span className="text-gray-400">{stanceDiff}</span>
      </span>
      <span>
        <span className="text-gray-500">使用数:</span>{' '}
        <b>{s.cardsPlayableThisTurn}</b>
        <span className="text-gray-400">{diff(s.cardsPlayableThisTurn, prev?.cardsPlayableThisTurn)}</span>
      </span>
      <span>
        <span className="text-gray-500">熱意追加:</span>{' '}
        {s.passionBuff}
        <span className="text-gray-400">{diff(s.passionBuff, prev?.passionBuff)}</span>
      </span>
      <span>
        <span className="text-gray-500">熱意増加 %:</span>{' '}
        {s.passionGainBonusPct}
        <span className="text-gray-400">{diff(s.passionGainBonusPct, prev?.passionGainBonusPct)}</span>
      </span>
      <span>
        <span className="text-gray-500">パラメータ上昇量増加 %:</span>{' '}
        {s.paramBoostPct}
        <span className="text-gray-400">{diff(s.paramBoostPct, prev?.paramBoostPct)}</span>
      </span>
    </div>
  )
}

export default function ResultPanel() {
  const result = useSimulatorStore((s) => s.result)
  const isSearching = useSimulatorStore((s) => s.isSearching)
  const catalog = useSimulatorStore((s) => s.catalog)

  if (isSearching) {
    return (
      <div className="border rounded p-3 bg-white">
        <p className="text-gray-600">探索中...</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="border rounded p-3 bg-white">
        <p className="text-gray-400 text-sm">「探索」ボタンを押すと結果が表示されます。</p>
      </div>
    )
  }

  if (result.patterns.length === 0) {
    return (
      <div className="border rounded p-3 bg-white">
        <p className="text-gray-600">
          プレイ可能な手がありません。手札・残り使用回数を確認してください。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        探索した葉ノード: {result.exploredLeafCount.toLocaleString()} / 枝刈り:{' '}
        {result.prunedCount.toLocaleString()} / 計算時間:{' '}
        {result.elapsedMs.toFixed(1)} ms
      </div>
      {result.patterns.map((p, i) => {
        // 鍵となるドロー: このパターンで実際に引いたカードの一覧
        const keyDraws = p.steps
          .filter((s) => s.drawnCards && s.drawnCards.length > 0)
          .map((s) => ({
            stepCard: s.cardName,
            drawn: s.drawnCards!,
          }))
        // 最終枠 (=最安定パターン) は別ラベル表示
        const isStablePick = i === result.patterns.length - 1 && result.patterns.length >= 2
        return (
        <div key={i} className={`border rounded p-3 ${isStablePick ? 'bg-emerald-50 border-emerald-300' : 'bg-white'}`}>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="text-lg font-bold text-[var(--color-accent)]">
              {isStablePick ? '🛡 安定' : `#${i + 1}`}
            </span>
            <span className="text-sm text-gray-600">
              期待スコア:{' '}
              <span className="text-base font-bold text-gray-900">
                {p.expectedScore.toFixed(1)}
              </span>
            </span>
            <span className="text-xs text-gray-500">
              最良: {p.bestScore} / 最悪: {p.worstScore}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                p.patternProbability >= 0.999
                  ? 'bg-green-100 text-green-700'
                  : p.patternProbability >= 0.5
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
              title="このプレイ順が成立する確率 (ドロー運込み)"
            >
              発生確率: {(p.patternProbability * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] text-gray-400" title="確率 × 期待スコア (パターンの貢献度)">
              総期待: {p.unconditionalExpected.toFixed(1)}
            </span>
          </div>
          {keyDraws.length > 0 && (
            <div className="mb-2 text-[11px] text-blue-700 bg-blue-50 rounded px-2 py-1">
              🎴 <b>鍵となるドロー</b>:{' '}
              {keyDraws.map((kd, ki) => (
                <span key={ki} className="ml-1">
                  {kd.stepCard} → {kd.drawn.map((d) => d.cardName).join('+')}
                  {ki < keyDraws.length - 1 ? ' ／ ' : ''}
                </span>
              ))}
            </div>
          )}
          <ol className="list-decimal list-inside text-sm space-y-1">
            {p.steps.map((step, si) => {
              const card = catalog?.byId.get(step.cardRef.cardId)
              const isDrink = step.cardName.startsWith('🥤')
              const variant = card?.variants.find(
                (v) => v.level === step.cardRef.level,
              )
              // customNoExile が true なら除外されないので「除外」表示しない
              const isExile =
                !isDrink &&
                card?.usage === 'once_per_lesson' &&
                !step.cardRef.customNoExile
              const prev = si > 0 ? p.steps[si - 1].stateAfter : undefined
              return (
                <li key={si} className="border-b last:border-b-0 pb-1">
                  <div>
                    <span className="font-medium">{step.cardName}</span>{' '}
                    {!isDrink && (
                      <span className="text-gray-500">[{step.cardRef.level}]</span>
                    )}
                    {isExile && (
                      <span
                        className="ml-1 px-1 text-[10px] rounded bg-red-100 text-red-700"
                        title="使用後に除外 (デッキ復帰しない)"
                      >
                        除外
                      </span>
                    )}
                    {variant?.raw_effect_text && (
                      <span className="text-gray-500 text-xs ml-2">
                        ({variant.raw_effect_text})
                      </span>
                    )}
                  </div>
                  {step.drawnCards && step.drawnCards.length > 0 && (
                    <div className="ml-6 mt-0.5 text-[11px] text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 inline-block">
                      🎴 ドロー: {step.drawnCards.map((d, di) => (
                        <span key={di} className="ml-1">
                          <b>{d.cardName}</b>
                          <span className="text-gray-500">[{d.level}]</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {step.alternatives && step.alternatives.length > 0 && (
                    <details
                      className="ml-6 mt-0.5"
                      onToggle={(e) => {
                        if ((e.currentTarget as HTMLDetailsElement).open) {
                          trackEvent('alternatives_open', {
                            alt_count: step.alternatives!.length,
                            pattern_rank: i + 1,
                          })
                        }
                      }}
                    >
                      <summary className="text-[11px] text-amber-700 cursor-pointer hover:underline">
                        ⚠ もし違うカードを引いた場合 ({step.alternatives.length}件)
                      </summary>
                      <div className="mt-1 ml-2 space-y-1.5">
                        {step.alternatives.map((alt, ai) => (
                          <div key={ai} className="border-l-2 border-amber-300 pl-2 text-[11px]">
                            <div>
                              🎴 <b>ドロー</b>: {alt.drawnCards.map((d, di) => (
                                <span key={di} className="ml-1">
                                  {d.cardName}<span className="text-gray-500">[{d.level}]</span>
                                </span>
                              ))}
                              <span className="ml-2 text-gray-500">
                                (発生確率 {(alt.probability * 100).toFixed(1)}%)
                              </span>
                            </div>
                            <div>
                              <b>続きの最適</b>:{' '}
                              {alt.continuation.length === 0
                                ? <span className="text-gray-500">(以降のプレイなし)</span>
                                : alt.continuation.map((s, ci) => (
                                  <span key={ci}>
                                    {ci > 0 ? ' → ' : ''}
                                    <span className="text-gray-800">{s.cardName}</span>
                                  </span>
                                ))}
                            </div>
                            <div className="text-gray-700">
                              <b>最終スコア</b>: <span className="font-bold text-indigo-700">{alt.bestScore}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {step.stateAfter && (
                    <StateLine s={step.stateAfter} prev={prev} />
                  )}
                </li>
              )
            })}
          </ol>
          {p.branchSamples.length > 1 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer">
                ドロー分岐サンプル ({p.branchSamples.length}件)
              </summary>
              <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc">
                {p.branchSamples.map((b, bi) => (
                  <li key={bi}>{b.description}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        )
      })}
    </div>
  )
}
