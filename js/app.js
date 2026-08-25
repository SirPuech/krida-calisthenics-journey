/**
 * Bootstrap and hash router.
 *
 * Hash routing (rather than history routing) is what makes this deploy to
 * GitHub Pages with zero configuration: every URL is still index.html, so
 * there is no 404 rewrite rule to get wrong and the site works identically
 * from a user page, a project page or a local file server.
 */
import { loadCatalogue } from './data.js';
import { store } from './store/index.js';
import { setLang, t } from './i18n.js';

import renderHome from './views/home.js';
import renderTree from './views/tree.js';
import renderSkill from './views/skill.js';
import renderProgram from './views/program.js';
import renderDashboard from './views/dashboard.js';
import renderLibrary from './views/library.js';
import renderSettings from './views/settings.js';

const ROUTES = [
  { pattern: /^\/?$/, name: 'home', view: renderHome },
  { pattern: /^\/tree$/, name: 'tree', view: renderTree },
  { pattern: /^\/skill\/([\w-]+)$/, name: 'tree', view: renderSkill },
  { pattern: /^\/program$/, name: 'program', view: renderProgram },
  { pattern: /^\/dashboard$/, name: 'dashboard', view: renderDashboard },
  { pattern: /^\/library$/, name: 'library', view: renderLibrary },
  { pattern: /^\/settings$/, name: 'settings', view: renderSettings },
];

const main = document.querySelector('main');
let catalogue = null;
let currentRoute = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  for (const route of ROUTES) {
    const match = raw.match(route.pattern);
    if (match) return { route, params: match.slice(1), raw };
  }
  return { route: ROUTES[0], params: [], raw: '/' };
}

function markNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.nav === name);
  });
}

function render({ scroll = true } = {}) {
  const { route, params, raw } = parseHash();
  markNav(route.name);
  main.innerHTML = '<div class="wrap"></div>';
  const mount = main.firstElementChild;
  const context = { catalogue, store, profile: store.profile, params, mount, rerender: () => render({ scroll: false }) };
  try {
    route.view(context);
  } catch (err) {
    console.error('[krida] view failed', err);
    mount.innerHTML = `<div class="empty">Something went wrong rendering this page.<br><span class="mono">${err.message}</span></div>`;
  }
  if (scroll && raw !== currentRoute) window.scrollTo({ top: 0, behavior: 'instant' });
  currentRoute = raw;
  updateFooter();
}

function updateFooter() {
  const meta = document.getElementById('footer-meta');
  const remote = store.remoteState;
  const bits = [`${catalogue?.skills.length ?? 0} skills`];
  if (remote.status === 'ok') bits.push('gist synced');
  else if (remote.status === 'error') bits.push('gist sync failed');
  else if (remote.status === 'syncing') bits.push('syncing…');
  meta.textContent = bits.join(' · ');
}

function wireChrome() {
  const nav = document.getElementById('site-nav');
  const toggle = document.querySelector('.nav-toggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.langBtn);
      store.update((p) => { p.lang = btn.dataset.langBtn; });
      render({ scroll: false });
    });
  });
}

async function boot() {
  try {
    [catalogue] = await Promise.all([loadCatalogue(), store.init()]);
  } catch (err) {
    main.innerHTML = `<div class="wrap"><div class="empty">${err.message}</div></div>`;
    return;
  }
  setLang(store.profile.lang || 'en');
  wireChrome();
  window.addEventListener('hashchange', () => render());
  store.subscribe(() => updateFooter());
  render();
}

boot();
export { t };
