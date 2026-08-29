# Optimizer

The prompt optimizer, extracted from `StudyMyPlays/be-promptful` so it can be
developed on its own. Paste a rough request, pick the agent or workspace it is
for, and get back a prompt written the way that product expects one.

Two families of output live behind one surface, which is why the modes are
grouped in the picker:

- **Task modes** (Claude Co-Work, Perplexity Comet) return a single clean prompt
  to paste into a chat.
- **Workspace modes** (Claude Projects, Gemini Gems, ChatGPT Projects) return the
  standing instructions that sit behind a saved workspace, and take an optional
  description of the knowledge base alongside the request.

## Running it

```bash
npm install
cp .env.example .env.local   # then set OPENROUTER_API_KEY
npm run dev
```

Without `OPENROUTER_API_KEY` the app renders and the route answers 503, so the
UI reports that optimization is not configured rather than failing at the model
provider.

## What is here

| Path | What it is |
| --- | --- |
| `src/lib/optimizer/optimizer.ts` | The whole feature definition: mode configs, system prompts, per-mode accents, input ceilings, the allow-list of models. |
| `src/lib/optimizer/score.ts` | The quality-score judge: a mode-agnostic 0-100 rubric (specificity/completeness/clarity/structure), run against both the raw input and every draft. Best-effort — returns `null` rather than throwing. |
| `src/lib/optimizer/refine.ts` | `runOptimize()`, the orchestrator: the generate call, the always-on baseline/draft scoring, and — when `deepOptimize` is requested — the two-pass critique-and-revise loop, using each judge's `issues` as the next revision's feedback. |
| `src/app/api/optimize/route.ts` | The server route. Validates the body, rate limits, calls `runOptimize()`, returns its result as-is. |
| `src/components/optimizer/` | `prompt-optimizer` (state, incl. the client-side `isPro` demo toggle), `search-input` (the composer, mode picker, and Deep Optimize toggle), `prompt-result` (structure-aware rendering of the output), `quality-score` (score/delta pills, Pro-gated breakdown), `before-after-diff` (Pro-gated word diff between the pre- and post-refinement drafts). |
| `src/lib/openrouter.ts` | One call to OpenRouter, with the upstream response reduced to "text, or the status that went wrong". |
| `src/lib/rate-limit.ts`, `src/lib/api-response.ts` | In-process token buckets and the shared `{ error }` failure shapes. |
| `src/components/ui/` | The five shadcn components the optimizer uses: button, select, skeleton, spinner, empty. |

## Differences from the app it came from

**There is no auth gate.** In `be-promptful` this route required a signed-in
user — the OpenRouter key is billable, and the session id was both the
authorization and the rate-limit key. This repo has no accounts, so the caller
is identified by IP and the limit stays at 20 per minute.

That is weaker on purpose. An IP is shared by everyone behind a NAT and rotated
freely by anyone who wants more than 20 calls a minute, so **before deploying
this anywhere the public can reach it, put an account check back in front of the
route** — `unauthorized()` is still in `src/lib/api-response.ts` for that, and
the rate-limit key should go back to the user id.

**The rate limit is per-process.** `src/lib/rate-limit.ts` holds its buckets in
memory, so on a platform that runs several instances each one counts
separately, and a redeploy resets the count. It is a brake on accidental
hammering, not a quota.

**Deep Optimize has its own, tighter limit.** Every request scores the raw
input and the draft (2 extra calls); opting into Deep Optimize adds a
two-pass critique-and-revise loop (up to 4 more), so a `deepOptimize: true`
request can cost up to 7 calls instead of 1. Those requests are capped at 5
per minute per IP, on top of — not instead of — the base 20/minute limit.

**Entrance animations work.** The components use `animate-in` /
`slide-in-from-*`; the original had `tw-animate-css` installed but never
imported, so those classes were inert there. `src/app/globals.css` imports it.
