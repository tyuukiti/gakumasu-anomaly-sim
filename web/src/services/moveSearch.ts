/**
 * 最終ターン最適ムーブ探索エンジン
 *
 * 仕組み:
 *   1. 現在の手札とドリンクを試行可能な選択肢とする
 *   2. 各選択肢を「1手目」とし、後継状態それぞれについて再帰探索
 *   3. cardsPlayableThisTurn <= 0 になり、かつドリンクも使い切ったら葉ノードとしてスコア計算
 *      (※ ドリンク使用は cardsPlayableThisTurn を消費しない無料アクション)
 *   4. ドリンクは保持リストから消費・カードは usage に応じて捨て札/除外
 *   5. 最後に "プレイ順" でグルーピングし、確率重み付き期待スコア降順で上位5パターンを返す
 */
import type { CardRef, GameState, Stance } from '../types/gameState'
import type { CardCatalog } from './cardCatalog'
import type { DrinkCatalog } from './drinkCatalog'
import { playCard, playDrink } from './effectExecutor'
import { evaluateScore } from './scoreEvaluator'
import type {
  MoveStep,
  SearchPattern,
  SearchResult,
  StateSnapshot,
  DrawnCardInfo,
  StepAlternative,
} from '../types/searchResult'
import {
  PROBABILITY_EPSILON,
  MAX_LEAVES,
  MAX_DEPTH_HARD,
  RESULT_PATTERN_COUNT,
} from '../utils/constants'

interface LeafRecord {
  steps: MoveStep[]
  probability: number
  score: number
}

interface SearchContext {
  catalog: CardCatalog
  drinkCatalog: DrinkCatalog
  leaves: LeafRecord[]
  prunedCount: number
}

function formatStance(stance: Stance): string {
  if (stance.kind === 'neutral') return '中立'
  if (stance.kind === 'aggressive') return `強気${stance.level}`
  // conserve
  if (stance.level >= 3) return 'のんびり'
  return `温存${stance.level}`
}

function snapshot(state: GameState): StateSnapshot {
  return {
    param: state.param,
    passion: state.passion,
    passionBuff: state.passionBuff,
    passionGainBonusPct: state.passionGainBonusPct,
    paramBoostPct: state.paramBoostPct,
    hp: state.hp,
    genki: state.genki,
    fullPower: state.fullPower,
    stanceLabel: formatStance(state.stance),
    cardsPlayableThisTurn: state.cardsPlayableThisTurn,
  }
}

export function searchOptimalMoves(
  initial: GameState,
  catalog: CardCatalog,
  drinkCatalog: DrinkCatalog,
): SearchResult {
  const start = performance.now()
  const ctx: SearchContext = { catalog, drinkCatalog, leaves: [], prunedCount: 0 }

  dfs(initial, [], 1.0, 0, ctx)

  const elapsedMs = performance.now() - start
  const patterns = aggregatePatterns(ctx.leaves, RESULT_PATTERN_COUNT)
  return {
    patterns,
    exploredLeafCount: ctx.leaves.length,
    prunedCount: ctx.prunedCount,
    elapsedMs,
  }
}

function dfs(
  state: GameState,
  pathSteps: MoveStep[],
  prob: number,
  depth: number,
  ctx: SearchContext,
): void {
  if (ctx.leaves.length >= MAX_LEAVES) return
  if (prob < PROBABILITY_EPSILON) {
    ctx.prunedCount++
    return
  }

  // 葉ノード条件:
  //   - 手札からプレイできない (使用回数 0 or 手札空)
  //   - かつドリンクも全て使い切った
  //   - もしくはハードリミット到達
  const canPlayCard =
    state.cardsPlayableThisTurn > 0 && state.hand.length > 0
  const canUseDrink = state.drinks.length > 0
  const reachedDepthLimit = depth >= MAX_DEPTH_HARD

  if ((!canPlayCard && !canUseDrink) || reachedDepthLimit) {
    const sb = evaluateScore(state)
    ctx.leaves.push({ steps: pathSteps, probability: prob, score: sb.total })
    return
  }

  // --- 1) 手札の各カードを順に試行 ---
  if (canPlayCard) {
    const triedCards = new Set<string>()
    for (const cardRef of state.hand) {
      const dedupKey = `card:${cardRef.cardId}#${cardRef.level}`
      if (triedCards.has(dedupKey)) continue
      triedCards.add(dedupKey)

      const successors = playCard(state, cardRef, ctx.catalog)
      if (successors.length === 0) continue

      const card = ctx.catalog.byId.get(cardRef.cardId)
      const cardName = card ? card.name : cardRef.cardId

      for (const succ of successors) {
        const scoreAfter = evaluateScore(succ.state).total
        const drawnCards = (succ.drawnCards ?? []).map<DrawnCardInfo>((d) => ({
          cardId: d.cardId,
          level: d.level,
          cardName: ctx.catalog.byId.get(d.cardId)?.name ?? d.cardId,
        }))
        const step: MoveStep = {
          cardRef,
          cardName,
          scoreAfter,
          stateAfter: snapshot(succ.state),
          drawnCards: drawnCards.length > 0 ? drawnCards : undefined,
        }
        dfs(succ.state, [...pathSteps, step], prob * succ.probability, depth + 1, ctx)
      }
    }
  }

  // --- 2) 保持ドリンクの各種類を試行 (同種ドリンクの重複は集約) ---
  if (canUseDrink) {
    const triedDrinks = new Set<string>()
    for (const drinkRef of state.drinks) {
      if (triedDrinks.has(drinkRef.drinkId)) continue
      triedDrinks.add(drinkRef.drinkId)

      const successors = playDrink(state, drinkRef, ctx.drinkCatalog)
      if (successors.length === 0) continue

      const drink = ctx.drinkCatalog.byId.get(drinkRef.drinkId)
      const drinkName = drink ? `🥤${drink.name}` : drinkRef.drinkId

      for (const succ of successors) {
        const scoreAfter = evaluateScore(succ.state).total
        // ドリンクは CardRef 型では無いので、表示用に擬似 ref を作成
        const pseudoCardRef: CardRef = {
          cardId: drinkRef.drinkId,
          level: '無印',
          instanceId: drinkRef.instanceId,
        }
        const drawnCards = (succ.drawnCards ?? []).map<DrawnCardInfo>((d) => ({
          cardId: d.cardId,
          level: d.level,
          cardName: ctx.catalog.byId.get(d.cardId)?.name ?? d.cardId,
        }))
        const step: MoveStep = {
          cardRef: pseudoCardRef,
          cardName: drinkName,
          scoreAfter,
          stateAfter: snapshot(succ.state),
          drawnCards: drawnCards.length > 0 ? drawnCards : undefined,
        }
        dfs(succ.state, [...pathSteps, step], prob * succ.probability, depth + 1, ctx)
      }
    }
  }
}

function aggregatePatterns(leaves: LeafRecord[], topN: number): SearchPattern[] {
  if (leaves.length === 0) return []

  // グループキー = プレイ順の連結
  const groups = new Map<string, LeafRecord[]>()
  for (const leaf of leaves) {
    const key = leaf.steps
      .map((s) => `${s.cardRef.cardId}#${s.cardRef.level}`)
      .join('|')
    const arr = groups.get(key) ?? []
    arr.push(leaf)
    groups.set(key, arr)
  }

  type Aggregated = { pattern: SearchPattern; rankKey: number }
  const aggregated: Aggregated[] = []
  for (const [, members] of groups) {
    if (members.length === 0) continue
    // パターン全体の到達確率 (このプレイ順が成立する確率)
    const totalProb = members.reduce((s, m) => s + m.probability, 0)
    // 条件付き期待スコア (このパターンに到達した前提での平均)
    const expectedScore =
      totalProb > 0
        ? members.reduce((s, m) => s + m.probability * m.score, 0) / totalProb
        : 0
    const bestScore = Math.max(...members.map((m) => m.score))
    const worstScore = Math.min(...members.map((m) => m.score))
    // 無条件期待 = 確率 × 条件付き期待 (パターンの真の貢献度)
    const unconditionalExpected = totalProb * expectedScore

    const rep = members[0]
    const branchSamples = members
      .slice()
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3)
      .map((m) => ({
        description: `${m.score}点 / 確率 ${((m.probability / totalProb) * 100).toFixed(1)}%`,
        score: m.score,
        probability: m.probability / totalProb,
      }))

    aggregated.push({
      pattern: {
        steps: rep.steps,
        expectedScore,
        bestScore,
        worstScore,
        patternProbability: totalProb,
        unconditionalExpected,
        branchSamples,
      },
      rankKey: expectedScore,
    })
  }

  aggregated.sort((a, b) => b.rankKey - a.rankKey)

  // --- 上位 (topN-1) 個は期待スコアで採用、ラスト 1 枠は「最安定」(発生確率最大) を選ぶ ---
  const result: SearchPattern[] = []
  const usedPatterns = new Set<SearchPattern>()
  const expectedSlots = Math.max(1, topN - 1)

  // 期待スコア上位 (topN-1) 件
  for (const a of aggregated) {
    if (result.length >= expectedSlots) break
    result.push(a.pattern)
    usedPatterns.add(a.pattern)
  }

  // 残り 1 枠: 既選出以外で発生確率が最大のもの (= 最も安定するパターン)
  if (result.length < topN) {
    const remaining = aggregated
      .filter((a) => !usedPatterns.has(a.pattern))
      .sort((x, y) => {
        // まず発生確率の高さ、同率なら期待スコア
        if (y.pattern.patternProbability !== x.pattern.patternProbability) {
          return y.pattern.patternProbability - x.pattern.patternProbability
        }
        return y.rankKey - x.rankKey
      })
    if (remaining.length > 0) {
      result.push(remaining[0].pattern)
    }
  }

  // 採用したパターンそれぞれに「代替ドロー分岐」を付与
  return result.map((p) => attachAlternatives(p, leaves))
}

/**
 * 1パターンの各ドローステップに対し、別カードを引いた場合の代替分岐 (続きの最適プレイ+スコア) を付与
 */
function attachAlternatives(pattern: SearchPattern, allLeaves: LeafRecord[]): SearchPattern {
  // 各 leaf について「action prefix (drawnを含まない card+level の連結)」を計算
  const leafPrefixKeys: string[][] = allLeaves.map((leaf) =>
    cumulativeActionKeys(leaf.steps),
  )
  const patternPrefix = cumulativeActionKeys(pattern.steps)

  const enhancedSteps: MoveStep[] = pattern.steps.map((step, k) => {
    if (!step.drawnCards || step.drawnCards.length === 0) return step

    const ownDrawSig = drawCardsSig(step.drawnCards)
    // step k 終了時の action prefix (= step k のカード行動も含む)
    const targetPrefix = patternPrefix[k]

    // sibling leaves: 同じ action prefix で、step k の drawn が異なる
    const groups = new Map<string, { leaf: LeafRecord; drawnCards: DrawnCardInfo[] }[]>()
    for (let li = 0; li < allLeaves.length; li++) {
      const leaf = allLeaves[li]
      if (leaf.steps.length <= k) continue
      if (leafPrefixKeys[li][k] !== targetPrefix) continue
      const leafDrawn = leaf.steps[k].drawnCards ?? []
      const sig = drawCardsSig(leafDrawn)
      if (sig === ownDrawSig) continue // 自分自身の draw は除外
      const arr = groups.get(sig) ?? []
      arr.push({ leaf, drawnCards: leafDrawn })
      groups.set(sig, arr)
    }

    // 各 draw グループの最良 leaf を採用
    const alts: StepAlternative[] = []
    for (const [, members] of groups) {
      const best = members.reduce((a, b) => (a.leaf.score >= b.leaf.score ? a : b))
      const totalProb = members.reduce((s, m) => s + m.leaf.probability, 0)
      alts.push({
        drawnCards: best.drawnCards,
        probability: totalProb,
        continuation: best.leaf.steps.slice(k + 1),
        bestScore: best.leaf.score,
      })
    }
    // probability の合計で正規化 (条件付き確率: alts の中での)
    const altsTotal = alts.reduce((s, a) => s + a.probability, 0) || 1
    for (const a of alts) a.probability /= altsTotal
    alts.sort((a, b) => b.bestScore - a.bestScore)

    return alts.length > 0 ? { ...step, alternatives: alts } : step
  })

  return { ...pattern, steps: enhancedSteps }
}

/** 各 step までの「action key」(cardId+level、drawnは含まず) を累積接続した配列を返す */
function cumulativeActionKeys(steps: MoveStep[]): string[] {
  const out: string[] = []
  let acc = ''
  for (const s of steps) {
    const k = `${s.cardRef.cardId}#${s.cardRef.level}`
    acc = acc ? `${acc}|${k}` : k
    out.push(acc)
  }
  return out
}

/** drawnCards の署名文字列 */
function drawCardsSig(drawn: DrawnCardInfo[]): string {
  return drawn.map((d) => `${d.cardId}#${d.level}`).sort().join('+')
}
