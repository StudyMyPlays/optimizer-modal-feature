'use client'
import { useState } from 'react'
import { Crown } from 'lucide-react'
import { SearchInput, type OptimizeInput } from '@/components/optimizer/search-input'
import { PromptResult, type PromptStatus } from '@/components/optimizer/prompt-result'
import { MODES, type OptimizerMode } from '@/lib/optimizer/optimizer'
import type { QualityScore } from '@/lib/optimizer/score'
import type { OptimizeResult } from '@/lib/optimizer/refine'
/**
 * Prompt optimizer surface. Two things come out of it, depending on the mode:
 * a clean one-off task prompt for an agent (Co-Work, Comet), or the standing
 * instructions behind a saved workspace (Claude Projects, Gemini Gems, ChatGPT
 * Projects). Embedded at the top of the library, in place of the old Featured
 * carousel. Generation runs server-side via the /api/optimize route.
 */
export function PromptOptimizer() {
  const [status, setStatus] = useState<PromptStatus>('idle')
  const [mode, setMode] = useState<OptimizerMode>('co-work')
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [score, setScore] = useState<QualityScore | null>(null)
  const [baseline, setBaseline] = useState<QualityScore | null>(null)
  const [refinement, setRefinement] = useState<OptimizeResult['refinement']>(undefined)
  const [error, setError] = useState('')
  const [lastInput, setLastInput] = useState<OptimizeInput | null>(null)
  // Client-side stub for a free/Pro split — there is no auth or billing in
  // this app. Flipping it locally shows what a real Pro tier would unlock
  // without wiring one up.
  const [isPro, setIsPro] = useState(false)
  const runOptimize = async (input: OptimizeInput) => {
    setPrompt(input.raw)
    setMode(input.mode)
    setLastInput(input)
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Optimization failed.')
        setStatus('error')
        return
      }
      setResult(data.text)
      setScore(data.score ?? null)
      setBaseline(data.baseline ?? null)
      setRefinement(data.refinement)
      setStatus('success')
    } catch {
      setError('Network error — check your connection and try again.')
      setStatus('error')
    }
  }
  const handleRetry = () => {
    if (lastInput) runOptimize(lastInput)
  }
  const handleReset = () => {
    setStatus('idle')
    setResult('')
    setPrompt('')
    setError('')
    setScore(null)
    setBaseline(null)
    setRefinement(undefined)
  }
  const handleModeChange = (next: OptimizerMode) => {
    setMode(next)
    if (status !== 'idle') {
      setStatus('idle')
      setResult('')
      setError('')
      setScore(null)
      setBaseline(null)
      setRefinement(undefined)
    }
  }
  const hasActivity = status !== 'idle'
  return (
    <section className="w-full pt-2 pb-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5">
        <div className="flex w-full justify-end">
          <button
            type="button"
            onClick={() => setIsPro((p) => !p)}
            aria-pressed={isPro}
            title="Demo toggle — no real billing. Shows what Pro would unlock."
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              isPro
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Crown className="h-3 w-3" />
            Pro preview
          </button>
        </div>
        {!hasActivity && (
          <header className="flex flex-col items-center gap-1.5 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Promptful
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {MODES[mode].kind === 'workspace'
                ? 'Turn an idea for a workspace into the instructions that run it'
                : 'Turn rough requests into clean prompts for AI agents'}
            </p>
          </header>
        )}
        <SearchInput
          onSubmit={runOptimize}
          isLoading={status === 'loading'}
          mode={mode}
          onModeChange={handleModeChange}
        />
        {hasActivity && (
          <PromptResult
            status={status}
            mode={mode}
            prompt={prompt}
            result={result}
            score={score}
            baseline={baseline}
            refinement={refinement}
            isPro={isPro}
            error={error}
            onRetry={handleRetry}
            onReset={handleReset}
          />
        )}
      </div>
    </section>
  )
}
