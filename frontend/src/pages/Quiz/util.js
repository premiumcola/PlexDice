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
  cover_to_decade: 'Aus welchem Jahrzehnt?',
  cover_to_genre: 'Welches Genre?',
  cover_to_studio: 'Welches Studio?',
  title_year_to_cover: 'Welches Poster gehört dazu?',
  actor_to_movie: 'In welchem Film spielt diese Person mit?',
  movie_to_actor: 'Wer spielt in diesem Film mit?',
  plot_to_movie: 'Zu welchem Film gehört dieser Plot?',
  tagline_to_movie: 'Zu welchem Film gehört dieser Slogan?',
  director_to_movie: 'Welchen Film hat diese Person inszeniert?',
  movie_to_fsk: 'Welche Altersfreigabe (FSK)?',
  movie_to_country: 'Aus welchem Land kommt der Film?',
  movie_to_director: 'Wer führte Regie?',
  movie_to_year_exact: 'In welchem Jahr erschien der Film?',
  movie_to_runtime: 'Wie lang ist der Film?',
  plot_redacted_to_movie: 'Erkennst du den Film am zensierten Plot?',
  actor_filmography_multi: 'Welche Filme gehören zu dieser Person? (mehrere)',
  writer_to_movie: 'Welchen Film schrieb diese Person?',
  two_actors_to_shared: 'In welchem Film spielten beide mit?',
  collection_member: 'Welcher Film gehört zu dieser Reihe?',
};

export const MODE_LABEL = {
  cover_to_title: 'Cover → Titel',
  cover_to_decade: 'Cover → Jahrzehnt',
  cover_to_genre: 'Cover → Genre',
  cover_to_studio: 'Cover → Studio',
  title_year_to_cover: 'Titel → Cover',
  actor_to_movie: 'Schauspieler → Film',
  movie_to_actor: 'Film → Schauspieler',
  plot_to_movie: 'Plot → Film',
  tagline_to_movie: 'Tagline → Film',
  director_to_movie: 'Regisseur → Film',
  movie_to_fsk: 'Film → FSK',
  movie_to_country: 'Film → Land',
  movie_to_director: 'Film → Regisseur',
  movie_to_year_exact: 'Film → Jahr',
  movie_to_runtime: 'Film → Laufzeit',
  plot_redacted_to_movie: 'Plot (zensiert)',
  actor_filmography_multi: 'Filmografie',
  writer_to_movie: 'Drehbuch → Film',
  two_actors_to_shared: 'Zwei Stars → Film',
  collection_member: 'Filmreihe',
};

export const TIER_LABEL = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };

// Modes whose image stem is a person photo (anchor the crop to the top → faces).
export const STEM_IS_PERSON = new Set([
  'actor_to_movie', 'director_to_movie', 'writer_to_movie', 'actor_filmography_multi',
]);
// Modes whose image options are person photos (top-anchor + keep the name label).
export const OPTIONS_ARE_PERSONS = new Set(['movie_to_actor', 'movie_to_director']);

// Modes whose OPTIONS are cover/person images (tall — they need vertical room).
// cover_to_* are intentionally absent: their options are short text chips and only
// the stem is a poster, which the image-stem branch in panelOnRight already covers.
export const IMAGE_OPTION_MODES = new Set([
  'title_year_to_cover', 'actor_to_movie', 'movie_to_actor', 'plot_to_movie',
  'tagline_to_movie', 'director_to_movie', 'movie_to_director', 'plot_redacted_to_movie',
  'actor_filmography_multi', 'writer_to_movie', 'two_actors_to_shared', 'collection_member',
]);

// md+ panel side. Tall image OPTIONS (covers / headshots) claim the full-height stage
// on the right so they never clip. Everything else sits in a Panel below: short
// text-chip trays (FSK, year, runtime, country, decade, titles fill a wide tray
// nicely), the wide multi-select grid, and the two-stars question. This mirrors the
// iPhone layout, where the Panel is always below.
export function panelOnRight(q) {
  if (q.mode === 'two_actors_to_shared') return false;
  if (q.multi_select && (q.options?.length || 0) > 4) return false;
  return IMAGE_OPTION_MODES.has(q.mode);
}
