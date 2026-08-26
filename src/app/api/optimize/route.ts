import { NextRequest, NextResponse } from 'next/server'
import {
  MODES,
  ALLOWED_MODELS,
  MAX_CTX_CHARS,
  MAX_RAW_CHARS,
  buildUserContent,
  isOptimizerMode,
} from '@/lib/optimizer/optimizer'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { callOpenRouter, openRouterErrorResponse, stripFences } from '@/lib/openrouter'
import {
  invalidBody,
  jsonError,
  notConfigured,
  rateLimited,
} from '@/lib/api-response'
export const runtime = 'nodejs'
/** Subject of the sentence in any upstream-failure message from this route. */
const FEATURE = 'The optimizer'
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5'
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000
/**
 * In the app this was extracted from, the gate on this route was a signed-in
 * user: the OpenRouter key is billable, and the session id was both the
 * authorization and the rate-limit key. This repo has no auth, so the caller is
 * identified by IP instead — the same limit, keyed on the best identifier
 * available here.
 *
 * That is weaker on purpose, not by oversight: an IP is shared by everyone
 * behind a NAT and rotated freely by anyone who wants more than 20 calls a
 * minute. Before this is deployed anywhere the key can be spent by the public,
 * put an account check back in front of it (see README).
 */
export async function POST(req: NextRequest) {
  let body: {
    mode?: string
    raw?: string
    ctx?: string
    model?: string
  }
  try {
    body = await req.json()
  } catch {
    return invalidBody()
  }
  const { mode, raw, ctx, model } = body
  if (!mode || !isOptimizerMode(mode)) {
    return jsonError('Unknown mode.', 400)
  }
  if (!raw || !raw.trim()) {
    return jsonError('Add a request above.', 400)
  }
  if (raw.length > MAX_RAW_CHARS) {
    return jsonError(
      `That request is too long — keep it under ${MAX_RAW_CHARS.toLocaleString()} characters.`,
      400,
    )
  }
  if (typeof ctx === 'string' && ctx.length > MAX_CTX_CHARS) {
    return jsonError(
      `That context is too long — keep it under ${MAX_CTX_CHARS.toLocaleString()} characters.`,
      400,
    )
  }
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    return notConfigured('Prompt optimization isn’t configured on this server.')
  }
  if (!checkRateLimit(`optimize:${getClientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return rateLimited()
  }
  const requestedModel = model?.trim()
  if (requestedModel && !ALLOWED_MODELS.has(requestedModel)) {
    return jsonError('Unsupported model.', 400)
  }
  const cfg = MODES[mode]
  const userContent = buildUserContent(raw, ctx, cfg.contextLabel)
  try {
    const result = await callOpenRouter({
      key,
      model: requestedModel || DEFAULT_MODEL,
      // Per-mode: a workspace instruction block runs several times longer than
      // a one-off task prompt, and truncating one mid-section ships a broken
      // artifact rather than a short one.
      maxTokens: cfg.maxTokens,
      origin: req.headers.get('origin'),
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user', content: userContent },
      ],
    })
    if (!result.ok) return openRouterErrorResponse(result, FEATURE)
    return NextResponse.json({ text: stripFences(result.text) })
  } catch (err) {
    console.error('Optimize request failed:', err)
    return jsonError('The optimizer could not reach the model provider. Try again.', 502)
  }
}
