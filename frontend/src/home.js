// Resolve the app's start/home path from the user's "Startseite" preference (start_tab, which
// App.jsx caches to localStorage when settings load), falling back to the last-used content tab and
// finally the Würfeln page ('/'). Shared by App.jsx's launch redirect and the header logo's "home"
// tap so the two always agree. Pure (only reads localStorage) — no router dependency.
export function homePath() {
  let startTab = 'last';
  try { startTab = localStorage.getItem('plexdice:startTab') || 'last'; } catch { /* storage off */ }
  if (startTab === 'quiz') return '/quiz';
  if (startTab === 'last') {
    let last = null;
    try { last = localStorage.getItem('plexdice:lastTab'); } catch { /* storage off */ }
    if (last === 'quiz') return '/quiz';
  }
  return '/';
}
