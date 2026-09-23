/**
 * Bootstrap and hash router.
 *
 * Hash routing (rather than history routing) is what makes this deploy to
 * GitHub Pages with zero configuration: every URL is still index.html, so
 * there is no 404 rewrite rule to get wrong and the site works identically
 * from a user page, a project page or a local file server.
 */
import { loadCatalogue, loadPrograms, loadGuide, loadConfig } from './data.js';
import { store } from './store/index.js';
import { setLang, t } from './i18n.js';

import renderHome from './views/home.js';
import renderTree from './views/tree.js';
import renderSkill from './views/skill.js';
import renderProgram from './views/program.js';
import renderDashboard from './views/dashboard.js';
import renderLibrary from './views/library.js';
import renderSettings from './views/settings.js';
import { resetSignInView } from './views/signin.js';
import renderReset from './views/reset.js';

const ROUTES = [
  { pattern: /^\/?$/, name: 'home', view: renderHome },
  { pattern: /^\/tree$/, name: 'tree', view: renderTree },
  { pattern: /^\/skill\/([\w-]+)$/, name: 'tree', view: renderSkill },
  { pattern: /^\/program$/, name: 'program', view: renderProgram },
  { pattern: /^\/dashboard$/, name: 'dashboard', view: renderDashboard },
  { pattern: /^\/library$/, name: 'library', view: renderLibrary },
  { pattern: /^\/settings$/, name: 'settings', view: renderSettings },
  { pattern: /^\/reset$/, name: null, view: renderReset },
];

const main = document.querySelector('main');
let catalogue = null;
let programs = null;
let guide = null;
let currentRoute = null;

function parseHash() {
  const full = location.hash.replace(/^#/, '') || '/';
  const path = full.split('?')[0];        // match on the path; views read the query
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) return { route, params: match.slice(1), raw: full };
  }
  return { route: ROUTES[0], params: [], raw: '/' };
}

function markNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.nav === name);
  });
}

let leaveHook = null;

function render({ scroll = true } = {}) {
  if (leaveHook) { try { leaveHook(); } catch (e) { /* ignore */ } leaveHook = null; }
  const { route, params, raw } = parseHash();
  main.innerHTML = '<div class="wrap"></div>';
  const mount = main.firstElementChild;
  const context = {
    catalogue, programs, guide, store, profile: store.profile, params, mount,
    onSignedIn,
    rerender: () => render({ scroll: false }),
    onLeave: (fn) => { leaveHook = fn; },
  };

  // No gate: the whole site is browsable as a guest. Accounts are opt-in from
  // Settings, and the landing page is where that choice is offered.
  document.body.classList.toggle('is-guest', !store.signedIn);
  markNav(route.name);
  try {
    route.view(context);
  } catch (err) {
    console.error('[krida] view failed', err);
    mount.innerHTML = `<div class="empty">Something went wrong rendering this page.<br><span class="mono">${err.message}</span></div>`;
  }
  if (scroll && raw !== currentRoute) window.scrollTo({ top: 0, behavior: 'instant' });
  currentRoute = raw;
  updateChrome();
}

function onSignedIn() {
  resetSignInView();
  location.hash = '#/dashboard';
  render();
}

function onSignedOut() {
  resetSignInView();
  render();
}

function updateChrome() {
  const meta = document.getElementById('footer-meta');
  meta.textContent = `${catalogue?.skills.length ?? 0} skills`
    + (store.signedIn ? ' · synced to your account' : '');

  const who = document.getElementById('whoami');
  const guest = !store.signedIn;
  who.hidden = false;
  who.classList.toggle('is-guest', guest);
  who.querySelector('.whoami-name').textContent = guest ? t('auth.guest') : store.profile.name;
  who.querySelector('.whoami-avatar').textContent = guest
    ? '·' : (store.profile.name || '?').charAt(0).toUpperCase();
  who.querySelector('#signout').hidden = guest;
  who.querySelector('#gotoaccount').hidden = !guest;
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
  document.getElementById('signout').addEventListener('click', async () => {
    await store.signOut();
    onSignedOut();
  });
}

async function boot() {
  try {
    const config = await loadConfig();
    [catalogue, programs, guide] = await Promise.all([
      loadCatalogue(), loadPrograms(), loadGuide(), store.init(config.apiBase),
    ]);
  } catch (err) {
    main.innerHTML = `<div class="wrap"><div class="empty">${err.message}</div></div>`;
    return;
  }
  setLang(store.profile.lang || 'en');
  wireChrome();
  window.addEventListener('hashchange', () => render());
  store.subscribe(() => updateChrome());
  render();
}

boot();
export { t };
