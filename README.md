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
| `src/app/api/optimize/route.ts` | The server route. Validates the body, rate limits, calls OpenRouter, strips code fences off the reply. |
| `src/components/optimizer/` | `prompt-optimizer` (state), `search-input` (the composer and mode picker), `prompt-result` (structure-aware rendering of the output). |
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

**Entrance animations work.** The components use `animate-in` /
`slide-in-from-*`; the original had `tw-animate-css` installed but never
imported, so those classes were inert there. `src/app/globals.css` imports it.
