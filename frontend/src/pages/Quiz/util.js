export const fmt = (n) => (n ?? 0).toLocaleString('de-DE');

export function relativeDate(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const secs = Math.floor((Date.now() - then.getTime()) / 1000);
  if (secs < 60) return 'gerade eben';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `vor ${mins} Min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `vor ${weeks} Woche${weeks > 1 ? 'n' : ''}`;
  return then.toLocaleDateString('de-DE');
}

export const MODE_PROMPT = {
  cover_to_title: 'Welcher Film ist das?',
  actor_to_movie: 'In welchem Film spielt diese Person mit?',
  movie_to_actor: 'Wer spielt in diesem Film mit?',
  plot_to_movie: 'Zu welchem Film gehört dieser Plot?',
};

export const MODE_LABEL = {
  cover_to_title: 'Cover → Titel',
  actor_to_movie: 'Schauspieler → Film',
  movie_to_actor: 'Film → Schauspieler',
  plot_to_movie: 'Plot → Film',
};
