'use client'
import { useState } from 'react'
import { SearchInput, type OptimizeInput } from '@/components/optimizer/search-input'
import { PromptResult, type PromptStatus } from '@/components/optimizer/prompt-result'
import { MODES, type OptimizerMode } from '@/lib/optimizer/optimizer'
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
  const [error, setError] = useState('')
  const [lastInput, setLastInput] = useState<OptimizeInput | null>(null)
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
  }
  const handleModeChange = (next: OptimizerMode) => {
    setMode(next)
    if (status !== 'idle') {
      setStatus('idle')
      setResult('')
      setError('')
    }
  }
  const hasActivity = status !== 'idle'
  return (
    <section className="w-full pt-2 pb-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5">
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
            error={error}
            onRetry={handleRetry}
            onReset={handleReset}
          />
        )}
      </div>
    </section>
  )
}
