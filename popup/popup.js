'use strict';

const api = typeof browser !== 'undefined' ? browser : chrome;
const $ = (s, r = document) => r.querySelector(s);

function on(id, evt, fn) {
  const el = $('#' + id);
  if (el) el.addEventListener(evt, fn);
}

const K_NOTES = 'quick-notes.notes';
const K_SETTINGS = 'quick-notes.settings';

const ACCENTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#d946ef', '#0891b2', '#64748b'];
const DEFAULTS = { theme: 'auto', accent: '#6366f1', font: 'system', autosave: 1200 };

let notes = [];
let settings = Object.assign({}, DEFAULTS);
let q = '';
let tag = null;
let starOnly = false;
let currentNoteId = null;
let autosaveTimer = null;
let toastTimer = null;
let dirty = false;      // l'éditeur contient des saisies pas encore enregistrées
let snapshot = '';      // empreinte (titre, contenu, tags) de la note telle que l'éditeur la connaît

const sig = n => JSON.stringify([n.title || '', n.content || '', n.tags || []]);

const storeGet = o => new Promise(r => api.storage.local.get(o, r));
const storeSet = o => new Promise(r => api.storage.local.set(o, r));

async function saveNotes() { await storeSet({ [K_NOTES]: notes }); }
async function saveSettings() { await storeSet({ [K_SETTINGS]: settings }); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function stripHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  return (t.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function hl(text, query) {
  const t = String(query || '').trim().toLowerCase();
  if (!t) return esc(text);
  const base = String(text).toLowerCase();
  if (base.indexOf(t) < 0) return esc(text);
  // On échappe chaque segment séparément : les longueurs de esc() ne sont pas
  // 1:1 (l'esperluette s'allonge), un slicing sur l'index brut désalignerait
  // le surlignage.
  let out = '';
  let i = 0;
  for (;;) {
    const idx = base.indexOf(t, i);
    if (idx < 0) { out += esc(String(text).slice(i)); break; }
    out += esc(String(text).slice(i, idx)) +
      '<mark class="hl">' + esc(String(text).slice(idx, idx + t.length)) + '</mark>';
    i = idx + t.length;
  }
  return out;
}

function fmt(t) {
  if (!t) return '';
  const d = Date.now() - t;
  const min = Math.floor(d / 60000);
  if (d < 60000) return "à l'instant";
  if (min < 60) return 'il y a ' + min + ' min';
  if (min < 1440) return 'il y a ' + Math.floor(min / 60) + ' h';
  if (min < 10080) return 'il y a ' + Math.floor(min / 1440) + ' j';
  return new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/* ---------- search / filter ---------- */

function sorted() {
  return [...notes].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

function visible() {
  const t = q.trim().toLowerCase();
  return sorted().filter(n => {
    if (starOnly && !n.starred) return false;
    if (tag && !(n.tags || []).includes(tag)) return false;
    if (!t) return true;
    return ((n.title || '') + ' ' + stripHtml(n.content) + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(t);
  });
}

/* ---------- render ---------- */

function render() {
  renderTags();
  renderList();
  renderStats();
  updateEditFlags();
}

function updateEditFlags() {
  const n = currentNoteId ? findNote(currentNoteId) : null;
  const p = $('#editPinBtn');
  const s = $('#editStarBtn');
  if (p) p.classList.toggle('on', !!(n && n.pinned));
  if (s) s.classList.toggle('on', !!(n && n.starred));
}

function plural(n, w) { return n + ' ' + (n > 1 ? w + 's' : w); }

function renderStats() {
  const shown = visible().length;
  const stars = notes.filter(n => n.starred).length;
  const pins = notes.filter(n => n.pinned).length;
  const left = plural(notes.length, 'note') + ' · ' + plural(shown, 'affichée');
  const right = [stars ? '★ ' + stars : '', pins ? '📌 ' + pins : '', tag ? '#' + tag : '']
    .filter(Boolean).join(' · ');
  const el = $('#footerStats');
  if (el) el.innerHTML = '<span>' + esc(left) + '</span><span>' + esc(right) + '</span>';
  const nc = $('#noteCount');
  if (nc) nc.textContent = plural(notes.length, 'note');
}

function renderTags() {
  const counts = {};
  notes.forEach(n => (n.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  if (tag && !counts[tag]) tag = null;
  const chips = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 14);
  $('#tagsBar').innerHTML = chips.map(t =>
    `<button class="tag-chip${t === tag ? ' active' : ''}" data-tag="${esc(t)}" title="Filtrer #${esc(t)}">#${esc(t)}</button>`
  ).join('');
}

function renderList() {
  const list = visible();
  const el = $('#notesList');
  const empty = $('#emptyState');
  if (notes.length === 0) {
    el.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  if (list.length === 0) {
    el.innerHTML = '<p class="no-match">Aucune note ne correspond&#8230;</p>';
    return;
  }
  el.innerHTML = list.map(card).join('');
}


function previewFor(n) {
  const text = stripHtml(n.content);
  return text.slice(0, 120) + (text.length > 120 ? '…' : '');
}
function card(n) {
  const title = n.title || 'Note sans titre';
  const preview = previewFor(n);
  return `
<article class="note-card${n.pinned ? ' pinned' : ''}" data-id="${esc(n.id)}">
  <span class="nc-actions">
    <button class="nc-dup" title="Dupliquer">⧉</button>
    <button class="nc-del" title="Supprimer">✕</button>
    <button class="nc-pin" title="${n.pinned ? 'Détacher' : 'Épingler en haut'}">📌</button>
  </span>
  <p class="nc-title">${hl(title, q)}</p>
  <div class="nc-body" data-body>${hl(preview, q)}</div>
  <div class="nc-foot">
    <span class="nc-date">${fmt(n.updatedAt)}</span>
    <span class="nc-side">
      <span class="nc-tags">${(n.tags || []).map(t => '<span class="nc-tag">#' + esc(t) + '</span>').join('')}</span>
      <button class="star-mark${n.starred ? ' starred' : ''}" title="${n.starred ? 'Retirer des favoris' : 'Ajouter aux favoris'}">★</button>
    </span>
  </div>
</article>`;
}

function updateWordCount() {
  const text = $('#editor').textContent || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $('#wordCount').textContent = words + (words > 1 ? ' mots' : ' mot');
}

function setStatus(text, cls) {
  const el = $('#saveStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('saving', 'saved');
  if (cls) el.classList.add(cls);
}

async function persistSidebarNote() {
  if (!currentNoteId || !dirty) return;
  dirty = false;
  const titleVal = $('#titleInput').value.trim();
  const content = $('#editor').innerHTML;
  const tagsVal = $('#tagsInput').value;
  const tags = parseTags(tagsVal);
  
  const n = findNote(currentNoteId);
  if (!n) {
    // Nouvelle note : on ne crée rien tant que tout est vide
    if (!titleVal && !stripHtml(content) && tags.length === 0) return;
    // Note was new, need to create it
    const newNote = {
      id: currentNoteId,
      title: titleVal || stripHtml(content).slice(0, 40) || 'Sans titre',
      content,
      tags,
      pinned: false,
      starred: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    notes.unshift(newNote);
    snapshot = sig(newNote);
  } else {
    n.title = titleVal || stripHtml(content).slice(0, 40) || 'Sans titre';
    n.content = content;
    n.tags = tags;
    n.updatedAt = Date.now();
    snapshot = sig(n);
  }
  
  await saveNotes();
  setStatus('À jour', 'saved');
}

function parseTags(v) {
  const set = new Set();
  String(v).split(/[,;]+|\s+/).forEach(t => {
    t = t.replace(/^#+/, '').trim();
    if (t) set.add(t.toLowerCase());
  });
  return [...set];
}

function handleEditorInput() {
  dirty = true;
  normalizeSizes();
  updateWordCount();
  const t = $('#editTitle');
  const ti = $('#titleInput');
  if (t && ti) t.textContent = ti.value || 'Nouvelle note';
  setStatus('Enregistrement…', 'saving');
  clearTimeout(autosaveTimer);
  const ms = Math.min(10000, Math.max(200, settings.autosave || 1200));
  autosaveTimer = setTimeout(async () => {
    await persistSidebarNote();
    setStatus('À jour', 'saved');
  }, ms);
}

async function flushNow() {
  if (!currentNoteId) return;
  clearTimeout(autosaveTimer);
  await persistSidebarNote();
  setStatus('À jour', 'saved');
}

function findNote(id) {
  return notes.find(n => n.id === id) || null;
}

async function togglePin(id) {
  const n = findNote(id);
  if (!n) return;
  n.pinned = !n.pinned;
  n.updatedAt = Date.now();
  await saveNotes();
  render();
}

async function toggleStar(id) {
  const n = findNote(id);
  if (!n) return;
  n.starred = !n.starred;
  n.updatedAt = Date.now();
  await saveNotes();
  render();
}

async function delNote(id, skipConfirm) {
  const found = findNote(id);
  if (!found) return;
  if (!skipConfirm && !await askConfirm({ title: 'Supprimer cette note ?', message: shortTitle(found) + ' sera supprimée.' })) return;
  const i = notes.findIndex(n => n.id === id);
  if (i < 0) return;
  const removed = notes.splice(i, 1)[0];
  await saveNotes();
  render();
  undoPrompt('Note supprimée', () => {
    notes.unshift(removed);
    saveNotes();
    render();
  });
}

async function dupNote(id) {
  const n = findNote(id);
  if (!n) return;
  const copy = Object.assign({}, n, {
    id: uid(),
    title: (n.title || 'Note sans titre') + ' (copie)',
    tags: [...(n.tags || [])],
    pinned: false,
    starred: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  notes.unshift(copy);
  await saveNotes();
  render();
  showToast('Note dupliquée ✓');
}

function normalizeTag(raw) {
  return String(raw || '').trim().toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_ -]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 24);
}

async function addTag() {
  const name = window.prompt('Nom du nouveau tag (ex : idées, travail, projets)');
  const t = normalizeTag(name);
  if (!t) return;
  if (notes.some(n => (n.tags || []).includes(t))) {
    tag = t;
    render();
    showToast('Le tag #' + t + ' existe déjà, filtre appliqué');
    return;
  }
  const note = {
    id: uid(),
    title: t,
    content: '',
    tags: [t],
    pinned: false,
    starred: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  notes.unshift(note);
  await saveNotes();
  tag = t;
  render();
  showToast('Tag #' + t + ' créé ✓');
}

function undoPrompt(msg, undo) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.hidden = false;
  toast.innerHTML = msg + ' · <b class="toast-undo">Annuler</b>';
  toast.classList.add('show');
  toast.onclick = () => {
    clearTimeout(toastTimer);
    toast.classList.remove('show');
    toast.hidden = true;
    toast.onclick = null;
    undo();
  };
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; toast.onclick = null; }, 250);
  }, 4000);
}

// Boîte de confirmation : résout true (confirmé) ou false (annulé, Échap, clic à côté).
function askConfirm({ title, message, confirmLabel = 'Supprimer' }) {
  return new Promise(resolve => {
    const m = $('#confirmModal');
    const ok = $('#confirmOk');
    const cancel = $('#confirmCancel');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    ok.textContent = confirmLabel;
    m.hidden = false;
    cancel.focus();
    const done = v => {
      m.hidden = true;
      ok.onclick = cancel.onclick = m.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
    };
    document.addEventListener('keydown', onKey, true);
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    m.onclick = e => { if (e.target === m) done(false); };
  });
}

const shortTitle = n => '« ' + String((n && n.title) || 'Sans titre').slice(0, 60) + ' »';

function showToast(msg, ms = 1800) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = msg;
  toast.hidden = false;
  toast.classList.add('show');
  toast.onclick = null;
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, ms);
}

/* ---------- view navigation ---------- */

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  const el = document.getElementById(viewId);
  if (el) el.hidden = false;
}

function openEditor(id) {
  clearTimeout(autosaveTimer);
  dirty = false;
  currentNoteId = id;
  showView('editorView');
  const n = findNote(id);
  if (n) {
    snapshot = sig(n);
    $('#titleInput').value = n.title || '';
    $('#tagsInput').value = (n.tags || []).join(', ');
    $('#editor').innerHTML = n.content || '';
    $('#editTitle').textContent = n.title || 'Édition';
  } else {
    resetEditor();
  }
  updateWordCount();
  updateEditFlags();
  setStatus('Prêt');
}

function resetEditor() {
  clearTimeout(autosaveTimer);
  dirty = false;
  snapshot = '';
  currentNoteId = uid();
  $('#titleInput').value = '';
  $('#tagsInput').value = '';
  $('#editor').innerHTML = '';
  $('#editTitle').textContent = 'Nouvelle note';
  updateWordCount();
  updateEditFlags();
  setStatus('Prêt');
}

// Une autre vue (onglet) a modifié la note ouverte ici : on recharge l'éditeur,
// sauf si l'utilisateur a des saisies en cours (elles gagnent à la prochaine sauvegarde).
function refreshOpenEditor() {
  const n = currentNoteId ? findNote(currentNoteId) : null;
  if (!n || dirty || sig(n) === snapshot) return;
  snapshot = sig(n);
  $('#titleInput').value = n.title || '';
  $('#tagsInput').value = (n.tags || []).join(', ');
  $('#editor').innerHTML = n.content || '';
  $('#editTitle').textContent = n.title || 'Édition';
  updateWordCount();
}

// Supprime la note ouverte puis revient à la liste (avec « Annuler » comme depuis la liste)
async function deleteCurrent() {
  const id = currentNoteId;
  const n = id ? findNote(id) : null;
  if (n) {
    if (!await askConfirm({ title: 'Supprimer cette note ?', message: shortTitle(n) + ' sera supprimée.' })) return;
  } else {
    const hasDraft = $('#titleInput').value.trim() || stripHtml($('#editor').innerHTML).trim();
    if (hasDraft && !await askConfirm({ title: 'Abandonner cette note ?', message: 'Le texte saisi n’a pas encore été enregistré.', confirmLabel: 'Abandonner' })) return;
  }
  clearTimeout(autosaveTimer);
  dirty = false;
  currentNoteId = null;
  showView('listView');
  if (n) await delNote(id, true); else render();
}

// Épingle / favori depuis l'éditeur : la note doit exister avant d'être marquée
async function flagCurrent(fn) {
  await flushNow();
  if (!currentNoteId || !findNote(currentNoteId)) { showToast('Écrivez d’abord quelque chose'); return; }
  fn(currentNoteId);
}

async function showList() {
  await flushNow();
  currentNoteId = null;
  showView('listView');
  render();
}

async function openInTab(id) {
  await flushNow();
  const url = api.runtime.getURL('popup/editor.html') + (id && findNote(id) ? '?id=' + encodeURIComponent(id) : '');
  api.tabs.create({ url });
}

function newNote() {
  resetEditor();
  showView('editorView');
}

/* ---------- settings / theme ---------- */

function hexToRgb(c) {
  const n = parseInt(c.slice(1), 16);
  return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
}

function applyTheme() {
  const resolved = settings.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : settings.theme;
  document.documentElement.dataset.theme = resolved;
  document.body.dataset.theme = resolved;
}

function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.dataset.font = settings.font;
  applyColors();
  applyTheme();
  $('#themeSelect').value = settings.theme;
  $('#fontSelect').value = settings.font;
  $('#autosaveInput').value = settings.autosave;
  buildAccentRow();
}

function applyColors() {
  const rgb = hexToRgb(settings.accent);
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.documentElement.style.setProperty('--accent-rgb', rgb);
}

function buildAccentRow() {
  $('#accentRow').innerHTML = ACCENTS.map(c =>
    '<button class="accent-swatch' + (c === settings.accent ? ' selected' : '') + '" data-color="' + c +
    '" style="background:' + c + '" title="' + c + '" aria-label="Accent ' + c + '"></button>'
  ).join('');
  $('#accentRow').querySelectorAll('.accent-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      settings.accent = sw.dataset.color;
      saveSettings();
      applySettings();
    });
  });
}

function closeModal() {
  $('#settingsModal').hidden = true;
}

async function wipeAll() {
  if (!notes.length) { showToast('Aucune note à supprimer'); return; }
  const msg = notes.length === 1 ? 'La note sera supprimée définitivement.' : 'Les ' + notes.length + ' notes seront supprimées définitivement. Cette action est irréversible.';
  if (!await askConfirm({ title: 'Tout effacer ?', message: msg, confirmLabel: 'Tout effacer' })) return;
  clearTimeout(autosaveTimer);
  notes = [];
  await saveNotes();
  currentNoteId = null;
  showView('listView');
  render();
  closeModal();
  showToast('Toutes les notes ont été supprimées');
}

function exportAll() {
  const blob = new Blob([JSON.stringify({ app: 'quick-notes', version: 1, notes }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'quick-notes-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showToast('Exporté ✓');
}

function importAll(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const arr = Array.isArray(data) ? data : data && Array.isArray(data.notes) ? data.notes : null;
      if (!arr) throw new Error('format');
      const ok = arr.every(n => n && typeof n === 'object' && typeof n.id === 'string');
      if (!ok) throw new Error('format');
      notes = arr;
      saveNotes();
      applySettings();
      render();
      closeModal();
      showToast(arr.length + ' note(s) importée(s) ✓');
    } catch (e) {
      showToast('Fichier invalide');
    }
  };
  r.readAsText(file);
}

/* ---------- events ---------- */

const SIZE_BASE_CLASS = 'qn-base';   // « taille normale » explicite (utile à l'intérieur d'un texte agrandi)
let pendingSize = null;                 // taille choisie sans sélection : appliquée à la saisie suivante (0 = normale)

// execCommand('fontSize') ne sait produire que des <font size="1…7"> : on marque la zone avec 7,
// puis on la convertit en <span> à la taille exacte demandée (en px), ou à la taille normale (px = 0).
function convertSizeFonts(px) {
  const ed = $('#editor');
  ed.querySelectorAll('font[size="7"]').forEach(f => {
    const s = document.createElement('span');
    if (px) s.style.fontSize = px + 'px'; else s.className = SIZE_BASE_CLASS;
    if (f.getAttribute('color')) s.style.color = f.getAttribute('color');
    if (f.getAttribute('face')) s.style.fontFamily = f.getAttribute('face');
    while (f.firstChild) s.appendChild(f.firstChild);
    // une taille posée à l'intérieur de la zone est remplacée par la nouvelle
    s.querySelectorAll('[style*="font-size"], .' + SIZE_BASE_CLASS).forEach(el => {
      el.style.removeProperty('font-size');
      el.classList.remove(SIZE_BASE_CLASS);
    });
    f.replaceWith(s);
  });
}

// Retire les <span> devenus inutiles (sans style ni classe, ou « taille normale » hors de tout texte agrandi).
function cleanSizeSpans() {
  const ed = $('#editor');
  const unwrap = el => { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove(); };
  Array.from(ed.querySelectorAll('span')).reverse().forEach(sp => {
    if (!sp.parentNode) return;
    if (sp.classList.contains(SIZE_BASE_CLASS)) {
      const outer = sp.parentElement && sp.parentElement.closest('[style*="font-size"]');
      if (!outer || !ed.contains(outer)) { sp.classList.remove(SIZE_BASE_CLASS); }
    }
    const onlyStyleClass = Array.from(sp.attributes).every(a => a.name === 'style' || a.name === 'class');
    if (onlyStyleClass && !sp.className.trim() && !(sp.getAttribute('style') || '').trim()) unwrap(sp);
  });
}

function applySize(px) {
  pendingSize = px;
  document.execCommand('fontSize', false, '7');
  convertSizeFonts(px);
  cleanSizeSpans();
}

// Sans sélection, la taille choisie s'applique à ce qui sera tapé ensuite : on convertit à la première frappe.
function normalizeSizes() {
  const ed = $('#editor');
  if (pendingSize !== null && ed && ed.querySelector('font[size="7"]')) { convertSizeFonts(pendingSize); cleanSizeSpans(); }
}

// Effacer la mise en forme : styles du navigateur + taille. Sans sélection, on traite le bloc courant.
function clearFormatting() {
  const ed = $('#editor');
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !ed.contains(sel.anchorNode)) return;
  if (sel.isCollapsed) {
    let b = sel.anchorNode;
    while (b && b !== ed && !(b.nodeType === 1 && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(b.tagName))) b = b.parentNode;
    const r = document.createRange();
    r.selectNodeContents(b && b !== ed ? b : ed);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  document.execCommand('removeFormat', false, null);
  applySize(0);
}

// Appliquer un bloc (citation, code…) ou, s'il est déjà actif sous le curseur, le retirer.
function toggleBlock(fmt) {
  const ed = $('#editor');
  const sel = window.getSelection();
  let n = sel && sel.rangeCount ? sel.anchorNode : null;
  while (n && n !== ed && !(n.nodeType === 1 && n.tagName.toLowerCase() === fmt)) n = n.parentNode;
  if (!n || n === ed) { document.execCommand('formatBlock', false, '<' + fmt + '>'); return; }
  if (fmt === 'blockquote') {
    // formatBlock ne sait pas retirer une citation : on la déballe à la main
    const hasBlocks = n.querySelector('p, div, h1, h2, h3, ul, ol, pre, blockquote');
    if (hasBlocks) {
      while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
      n.remove();
    } else {
      const p = document.createElement('p');
      while (n.firstChild) p.appendChild(n.firstChild);
      n.replaceWith(p);
    }
  } else {
    document.execCommand('formatBlock', false, '<p>');
  }
}

function bind() {
  const searchInput = $('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      q = e.target.value;
      render();
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.target.value = ''; q = ''; render(); e.target.blur(); }
    });
  }
  on('addTagBtn', 'click', addTag);
  on('newNoteBtn', 'click', newNote);
  on('emptyNewBtn', 'click', newNote);

  on('starFilterBtn', 'click', () => {
    starOnly = !starOnly;
    const btn = $('#starFilterBtn');
    if (btn) btn.classList.toggle('on', starOnly);
    render();
  });

  on('themeToggle', 'click', () => {
    const order = ['auto', 'light', 'dark'];
    settings.theme = order[(order.indexOf(settings.theme) + 1) % 3];
    saveSettings();
    applySettings();
  });

  on('settingsBtn', 'click', () => { $('#settingsModal').hidden = false; });
  on('closeSettings', 'click', closeModal);
  const modal = $('#settingsModal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal();
    });
  }

  on('themeSelect', 'change', e => { settings.theme = e.target.value; saveSettings(); applySettings(); });
  on('fontSelect', 'change', e => { settings.font = e.target.value; saveSettings(); applySettings(); });
  on('autosaveInput', 'change', e => {
    const v = Math.min(10000, Math.max(200, +e.target.value || 1200));
    settings.autosave = v;
    e.target.value = v;
    saveSettings();
  });

  on('exportAllBtn', 'click', exportAll);
  on('exportAllTopBtn', 'click', exportAll);
  on('wipeBtn', 'click', wipeAll);
  on('importAllBtn', 'click', () => {
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = '.json,application/json';
    f.onchange = () => { if (f.files[0]) importAll(f.files[0]); };
    f.click();
  });

  const tagsBar = $('#tagsBar');
  if (tagsBar) {
    tagsBar.addEventListener('click', e => {
      const chip = e.target.closest('.tag-chip');
      if (!chip) return;
      tag = tag === chip.dataset.tag ? null : chip.dataset.tag;
      render();
    });
  }

  const notesList = $('#notesList');
  if (notesList) {
    notesList.addEventListener('click', e => {
      const cardEl = e.target.closest('.note-card');
      if (!cardEl) return;
      const id = cardEl.dataset.id;
      if (e.target.closest('.nc-pin')) { togglePin(id); return; }
      if (e.target.closest('.star-mark')) { toggleStar(id); return; }
      if (e.target.closest('.nc-del')) { delNote(id); return; }
      if (e.target.closest('.nc-dup')) { dupNote(id); return; }
      openEditor(id);
    });
  }

  on('backBtn', 'click', showList);
  on('openInTabBtn', 'click', () => openInTab(currentNoteId));
  on('editPinBtn', 'click', () => flagCurrent(togglePin));
  on('editStarBtn', 'click', () => flagCurrent(toggleStar));
  on('editDelBtn', 'click', deleteCurrent);
  on('titleInput', 'input', handleEditorInput);
  on('tagsInput', 'input', handleEditorInput);
  on('editor', 'input', handleEditorInput);
  on('editor', 'blur', flushNow);
  on('titleInput', 'blur', flushNow);
  on('tagsInput', 'blur', flushNow);

  const toolbar = $('#toolbar');
  if (toolbar) {
    // Empêche le mousedown de voler la sélection avant execCommand
    toolbar.addEventListener('mousedown', e => {
      const btn = e.target.closest('.bb');
      if (btn && btn.tagName === 'BUTTON') e.preventDefault();
    });
    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('.bb');
      if (!btn || btn.tagName === 'SELECT') return;
      const cmd = btn.dataset.cmd;
      const fmt = btn.dataset.format;
      if (fmt) {
        toggleBlock(fmt);
      } else if (cmd === 'link') {
        const url = window.prompt('URL du lien :', 'https://');
        if (url) {
          const norm = /^(https?:|mailto:)/i.test(url) ? url : 'https://' + url;
          document.execCommand('createLink', false, norm);
        }
      } else if (cmd === 'unlink') {
        document.execCommand('unlink', false, null);
      } else if (cmd === 'hr') {
        document.execCommand('insertHorizontalRule', false, null);
      } else if (cmd === 'clear') {
        clearFormatting();
      } else if (cmd) {
        document.execCommand(cmd, false, null);
      }
      const ed = $('#editor');
      if (ed) ed.focus();
      handleEditorInput();
    });

    on('sizeSel', 'change', e => {
      const v = e.target.value;
      e.target.value = '';
      if (!v) return;
      applySize(v === 'normal' ? 0 : parseInt(v, 10));
      handleEditorInput();
    });
    on('colorSel', 'change', e => {
      const v = e.target.value;
      if (v) { document.execCommand('foreColor', false, v); handleEditorInput(); }
      e.target.value = '';
    });
    on('fontSel', 'change', e => {
      const v = e.target.value;
      if (v) { document.execCommand('fontName', false, v); handleEditorInput(); }
      e.target.value = '';
    });
    on('hlSel', 'change', e => {
      const v = e.target.value;
      if (v) { document.execCommand('hiliteColor', false, v); handleEditorInput(); }
      e.target.value = '';
    });
  }

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newNote(); return; }
    if (e.key === 'Escape') {
      if ($('#settingsModal') && !$('#settingsModal').hidden) { closeModal(); return; }
      if (tag) { tag = null; render(); return; }
      if (q) { if ($('#searchInput')) $('#searchInput').value = ''; q = ''; render(); }
      return;
    }
    if (e.key === '/' && $('#searchInput') && (!$('#settingsModal') || $('#settingsModal').hidden)) {
      // Ne pas voler la touche '/' pendant une saisie (éditeur, titre, tags, recherche)
      const t = e.target;
      const editing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (!editing && document.activeElement !== $('#searchInput')) {
        e.preventDefault();
        $('#searchInput').focus();
      }
    }
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[K_NOTES]) {
      notes = changes[K_NOTES].newValue || [];
      // Si la note ouverte a été supprimée ailleurs, on retourne à la liste
      if (currentNoteId && snapshot && !findNote(currentNoteId) && !dirty) {
        currentNoteId = null;
        showView('listView');
      }
      refreshOpenEditor();
      render();
    }
    if (changes[K_SETTINGS]) {
      Object.assign(settings, changes[K_SETTINGS].newValue || {});
      applySettings();
      render();
    }
  });
}

async function main() {
  const d = await storeGet({ [K_SETTINGS]: DEFAULTS, [K_NOTES]: [] });
  notes = d[K_NOTES] || [];
  settings = Object.assign({}, DEFAULTS, d[K_SETTINGS] || {});
  bind();
  applySettings();
  render();
}

main();