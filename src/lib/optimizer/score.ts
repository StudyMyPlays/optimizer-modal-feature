import { callOpenRouter } from '@/lib/openrouter'

export interface ScoreBreakdown {
  specificity: number
  completeness: number
  clarity: number
  structure: number
}

export interface QualityScore {
  score: number
  breakdown: ScoreBreakdown
  issues: string[]
}

/**
 * Fixed judge model, independent of whatever model generated the text.
 * Scoring is a much smaller job than writing the draft, and a fixed judge
 * keeps scores comparable across requests that pick different generation
 * models — a Sonnet draft and a Haiku draft are judged the same way.
 */
export const JUDGE_MODEL = 'anthropic/claude-haiku-4.5'
const JUDGE_MAX_TOKENS = 400

const JUDGE_SYSTEM = `You are a prompt-quality judge. Score the text below against four categories, 0-25 each. Judge general prompt-engineering quality — do not require any particular template or heading. A one-sentence raw request and a fully structured instruction block are scored on the same rubric.
# CATEGORIES
- specificity (0-25): concrete nouns, numbers, named tools/files/audiences instead of vague language.
- completeness (0-25): goal, constraints, and success criteria are all present, even if only implied.
- clarity (0-25): one reasonable interpretation, no contradictions, no undefined terms.
- structure (0-25): organized so it can be acted on without re-reading — headings followed if present, otherwise logical order and one idea per sentence.
# SCORING RULES
- Score the text as written. Do not reward length. Do not penalize a short text that is already complete and unambiguous.
- issues: 0-3 short, concrete, actionable fixes, most-impactful first. Empty array if there is nothing worth fixing.
# OUTPUT
Return ONLY a JSON object matching exactly this shape, no prose, no markdown fences, no backticks:
{"score": <int 0-100, the sum of the four category scores>, "breakdown": {"specificity": <int 0-25>, "completeness": <int 0-25>, "clarity": <int 0-25>, "structure": <int 0-25>}, "issues": [<string>, ...]}`

const CATEGORY_KEYS = ['specificity', 'completeness', 'clarity', 'structure'] as const

function clamp(n: unknown, max: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.max(0, Math.min(max, Math.round(n)))
}

/**
 * `response_format: json_object` biases the model toward valid JSON but does
 * not guarantee the shape — a missing field, a string where a number was
 * expected, or an out-of-range score all parse fine and fail here instead.
 * Any shape mismatch returns null rather than a half-trusted score, since a
 * silently-wrong number is worse than an absent one on a metric users compare
 * across requests.
 */
function parseJudgeResponse(text: string): QualityScore | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const breakdownRaw = obj.breakdown
  if (!breakdownRaw || typeof breakdownRaw !== 'object') return null
  const breakdown = {} as ScoreBreakdown
  for (const key of CATEGORY_KEYS) {
    const value = clamp((breakdownRaw as Record<string, unknown>)[key], 25)
    if (value === null) return null
    breakdown[key] = value
  }
  const score = clamp(obj.score, 100)
  if (score === null) return null
  const issues = Array.isArray(obj.issues)
    ? obj.issues.filter((i): i is string => typeof i === 'string').slice(0, 3)
    : []
  return { score, breakdown, issues }
}

/**
 * Scores a piece of text against the quality rubric. Best-effort: any
 * transport failure, empty reply, or malformed JSON returns null rather than
 * throwing, so a judge hiccup degrades the score to "unavailable" instead of
 * failing the whole optimize request.
 */
export async function judgeText(args: {
  key: string
  text: string
  origin?: string | null
}): Promise<QualityScore | null> {
  try {
    const result = await callOpenRouter({
      key: args.key,
      model: JUDGE_MODEL,
      maxTokens: JUDGE_MAX_TOKENS,
      responseFormat: { type: 'json_object' },
      origin: args.origin,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: args.text },
      ],
    })
    if (!result.ok) return null
    return parseJudgeResponse(result.text)
  } catch {
    return null
  }
}
