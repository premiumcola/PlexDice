import { Target } from 'lucide-react';

// Placeholder — full landing screen (CTA + recent rounds + cast banner) lands in T11.
export default function QuizHome() {
  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 sm:py-10">
        <header className="mb-6 pb-4 border-b border-zinc-900 flex items-center gap-3">
          <Target className="w-7 h-7 text-amber-400" strokeWidth={2.4} />
          <h1 className="font-display-tight text-3xl lg:text-4xl tracking-tight leading-none">Quiz</h1>
        </header>
        <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-amber-500/10 p-8 text-center text-zinc-400">
          Quiz-Modus kommt gleich…
        </div>
      </div>
    </div>
  );
}
