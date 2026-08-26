import { PromptOptimizer } from '@/components/optimizer/prompt-optimizer'

export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <PromptOptimizer />
    </main>
  )
}
