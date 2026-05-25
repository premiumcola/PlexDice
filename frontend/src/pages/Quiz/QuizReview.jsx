import { useEffect, useState } from 'react';
import { ArrowLeft, Check, X, Clock, Loader2 } from 'lucide-react';
import { navigate } from '../../router';
import { quizRound } from '../../api';
import { MODE_LABEL, fmt } from './util';

function learningBadge(attempts) {
  if (!attempts || attempts.length < 2) return null;
  const sorted = [...attempts].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  const n = sorted.length;
  const last = sorted[n - 1];
  const prev = sorted[n - 2];
  if (last.correct && prev.correct) return '📈 2× richtig in Folge';
  if (last.correct && !prev.correct) return `🔁 Beim ${n}. Mal endlich`;
  if (!last.correct) return `🌀 Schon zum ${n}. Mal verpasst`;
  return null;
}

function ResultIcon({ q }) {
  if (q.correct) return <Check className="w-5 h-5 text-emerald-400" />;
  if (q.chosen_option_id == null) return <Clock className="w-5 h-5 text-amber-400" />;
  return <X className="w-5 h-5 text-rose-400" />;
}

export default function QuizReview({ roundId }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    quizRound(roundId).then(setRecord).catch(() => setError(true));
  }, [roundId]);

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-zinc-400">Runde nicht gefunden.</p>
        <button type="button" onClick={() => navigate('/quiz')} className="px-5 py-3 rounded-xl bg-amber-400 text-zinc-950 font-semibold">Zum Quiz</button>
      </div>
    );
  }
  if (!record) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const stats = record.movie_stats || {};

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 sm:py-10">
        <header className="mb-5 flex items-center gap-3">
          <button type="button" onClick={() => navigate('/quiz')} aria-label="Zurück"
            className="w-10 h-10 rounded-xl bg-zinc-900 ring-1 ring-zinc-800 flex items-center justify-center active:scale-95 shrink-0">
            <ArrowLeft className="w-5 h-5 text-zinc-300" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display-tight text-2xl lg:text-3xl tracking-tight leading-none truncate">{record.name}</h1>
            <div className="text-sm text-zinc-500 tabular-nums mt-0.5">{fmt(record.score)} Punkte · {record.size} Fragen</div>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
          {(record.questions || []).map((q) => {
            const badge = learningBadge(stats[q.movie_key]);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => navigate(`/?movie=${encodeURIComponent(q.movie_key)}`)}
                className="w-full flex items-center gap-3 rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 p-3 text-left active:scale-[0.99] transition-transform"
              >
                <img src={`/api/library/thumb/${q.movie_key}`} alt="" loading="lazy"
                  className="w-10 h-15 rounded-md object-cover bg-zinc-800 shrink-0" style={{ width: 40, height: 60 }}
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-100 truncate">
                    {q.movie_title} {q.movie_year ? <span className="text-zinc-500 tabular-nums">· {q.movie_year}</span> : null}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">{MODE_LABEL[q.mode] || q.mode}</div>
                  {!q.correct && (
                    <div className="text-xs text-zinc-400 mt-0.5 truncate">
                      Du: {q.chosen_text || '–'} · <span className="text-emerald-300">Richtig: {q.correct_text}</span>
                    </div>
                  )}
                  {badge && <div className="text-xs text-amber-300 mt-0.5">{badge}</div>}
                </div>
                <div className="shrink-0"><ResultIcon q={q} /></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
