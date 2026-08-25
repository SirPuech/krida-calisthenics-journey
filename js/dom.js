/** Tiny DOM helpers. Views build HTML strings; anything interpolated goes through esc(). */

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function pct(ratio) {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

export function formatStandard(std) {
  return std.type === 'hold' ? `${std.sets} × ${std.amount}s` : `${std.sets} × ${std.amount}`;
}

export function formatDate(iso, lang = 'en') {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' });
}

/** YouTube watch/short/youtu.be URL -> privacy-preserving embed URL. */
export function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    let id = null;
    let start = u.searchParams.get('t') || u.searchParams.get('start') || '';
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.slice(7);
    if (!id) return null;
    start = String(start).replace(/[^0-9]/g, '');
    return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
  } catch {
    return null;
  }
}

/** Delegated click handler: data-act="name" anywhere under root. */
export function onAction(root, handlers) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target || !root.contains(target)) return;
    const handler = handlers[target.dataset.act];
    if (handler) { event.preventDefault(); handler(target, event); }
  });
}
