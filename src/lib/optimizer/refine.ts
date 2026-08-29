import { NextResponse } from 'next/server'
import { callOpenRouter, openRouterErrorResponse, stripFences } from '@/lib/openrouter'
import { MODES, buildUserContent, type OptimizerMode, type ModeConfig } from '@/lib/optimizer/optimizer'
import { judgeText, type QualityScore } from '@/lib/optimizer/score'

/**
 * Fixed at two passes, not user-adjustable in this pass. Each pass is a
 * revise + judge call, so this already doubles the call count of an opted-in
 * request — a knob for "how many" is a later refinement, not a launch need.
 */
const REFINE_ITERATIONS = 2

export interface RefinementIteration {
  score: QualityScore | null
}

export interface OptimizeResult {
  text: string
  score: QualityScore | null
  baseline: QualityScore | null
  /** Present only when deepOptimize ran at least one pass. */
  refinement?: {
    draft0: string
    draft0Score: QualityScore | null
    iterations: RefinementIteration[]
    /** Set if the loop stopped before REFINE_ITERATIONS because a revise call failed. */
    warning?: string
  }
}

/**
 * Appended to, not substituted for, the mode's own system prompt — the
 * mode's OUTPUT FORMAT / OUTPUT RULES / ⚠️ convention must still apply to the
 * revised draft, or a revision "fixes" the content while breaking the shape
 * the renderer and the user's paste target both depend on.
 */
function buildReviseSystem(cfg: ModeConfig, issues: string[]): string {
  return `${cfg.system}

# REVISION MODE
You already wrote a draft for this request below. A separate reviewer scored it and found issues. Revise the draft to fix every issue listed while keeping the exact same OUTPUT FORMAT and OUTPUT RULES given above. Do not restart from scratch — keep what already works and change only what the issues call out.
ISSUES TO FIX
${issues.length ? issues.map((i) => `- ${i}`).join('\n') : '- (none — make only small clarity or specificity improvements)'}
Output ONLY the revised draft, in the same format as the original. No commentary about what changed.`
}

/**
 * Owns the whole optimize call sequence, so the route stays a thin HTTP
 * wrapper — the same split `openrouter.ts` (transport) and `route.ts` (HTTP)
 * already have.
 *
 * Only the initial generate call is fail-hard, matching the single-call
 * behaviour this replaces. Every judge and revise call after it is
 * best-effort: a judge failure degrades a score to null rather than failing
 * a request that already has a usable draft, and a revise failure stops the
 * refinement loop early and returns the last good draft instead of erroring
 * out from under a user who was about to get a working result.
 */
export async function runOptimize(args: {
  key: string
  mode: OptimizerMode
  raw: string
  ctx?: string
  model: string
  deepOptimize: boolean
  origin?: string | null
}): Promise<{ ok: true; result: OptimizeResult } | { ok: false; response: NextResponse }> {
  const { key, mode, raw, ctx, model, deepOptimize, origin } = args
  const cfg = MODES[mode]
  const userContent = buildUserContent(raw, ctx, cfg.contextLabel)

  // The raw-input score never depends on the generated draft, so it runs
  // alongside the generate call instead of after it — free scoring latency.
  const [generateResult, baseline] = await Promise.all([
    callOpenRouter({
      key,
      model,
      maxTokens: cfg.maxTokens,
      origin,
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user', content: userContent },
      ],
    }),
    judgeText({ key, text: raw, origin }),
  ])

  if (!generateResult.ok) {
    return { ok: false, response: openRouterErrorResponse(generateResult, 'The optimizer') }
  }

  const draft0 = stripFences(generateResult.text)
  const draft0Score = await judgeText({ key, text: draft0, origin })

  if (!deepOptimize) {
    return { ok: true, result: { text: draft0, score: draft0Score, baseline } }
  }

  let current = draft0
  let currentScore = draft0Score
  const iterations: RefinementIteration[] = []
  let warning: string | undefined

  for (let i = 0; i < REFINE_ITERATIONS; i++) {
    // The judge's own issues list from the previous pass IS the critique —
    // no separate critique call needed.
    const issues = currentScore?.issues ?? []
    const reviseResult = await callOpenRouter({
      key,
      model,
      maxTokens: cfg.maxTokens,
      origin,
      messages: [
        { role: 'system', content: buildReviseSystem(cfg, issues) },
        { role: 'user', content: `${userContent}\n\nPREVIOUS DRAFT:\n${current}` },
      ],
    })
    if (!reviseResult.ok) {
      warning = `Stopped after ${i} of ${REFINE_ITERATIONS} refinement passes — the reviser was unavailable.`
      break
    }
    current = stripFences(reviseResult.text)
    currentScore = await judgeText({ key, text: current, origin })
    iterations.push({ score: currentScore })
  }

  return {
    ok: true,
    result: {
      text: current,
      score: currentScore,
      baseline,
      refinement: { draft0, draft0Score, iterations, warning },
    },
  }
}
