'use strict';

const api = typeof browser !== 'undefined' ? browser : chrome;
const $ = (s, r = document) => (r || document).querySelector(s);

const K_NOTES = 'quick-notes.notes';
const K_SETTINGS = 'quick-notes.settings';
const K_WS = 'quick-notes.workspace';

let notes = [];
let settings = { theme: 'auto', accent: '#6366f1', font: 'system', autosave: 1200 };
let noteId = null;        // id de la note en cours (null = brouillon pas encore persisté)
let autosaveTimer = null;
let wsTimer = null;
let toastTimer = null;
let dirty = false;      // saisies pas encore enregistrées
let snapshot = '';      // empreinte (titre, contenu, tags) de la note telle que l'éditeur la connaît

const sig = n => JSON.stringify([n.title || '', n.content || '', n.tags || []]);

const storeGet = o => new Promise(r => api.storage.local.get(o, r));
const storeSet = o => new Promise(r => api.storage.local.set(o, r));

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); 
}

function stripHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  return (t.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function parseTags(v) {
  const set = new Set();
  String(v || '').split(/[,;]+|\s+/).forEach(t => {
    t = t.replace(/^#+/, '').trim();
    if (t) set.add(t.toLowerCase());
  });
  return [...set];
}

function findNote(id) {
  return notes.find(n => n.id === id) || null;
}

function fmtTime(t) {
  return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function setStatus(text, cls) {
  const el = $('#saveStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('saving', 'saved');
  if (cls) el.classList.add(cls);
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
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  toast.classList.add('show');
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, ms);
}

/* ---------- rendu / compteurs ---------- */

function updateWordCount() {
  const el = $('#wordCount');
  if (!el) return;
  const text = ($('#editor').textContent || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  el.textContent = words + (words > 1 ? ' mots' : ' mot');
}

function updatePinStar() {
  const n = noteId ? findNote(noteId) : null;
  const pinBtn = $('#pinBtn');
  const starBtn = $('#starBtn');
  if (pinBtn) pinBtn.classList.toggle('on', !!(n && n.pinned));
  if (starBtn) starBtn.classList.toggle('on', !!(n && n.starred));
}

/* ---------- thème / réglages ---------- */

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
  document.body.dataset.font = settings.font || 'system';
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.documentElement.style.setProperty('--accent-rgb', hexToRgb(settings.accent));
  applyTheme();
}

/* ---------- persistance ---------- */

async function persistNote() {
  if (!dirty) return;
  dirty = false;
  const title = $('#titleInput').value.trim();
  const content = $('#editor').innerHTML;
  const tags = parseTags($('#tagsInput').value);
  const hasContent = title || stripHtml(content) || tags.length > 0;

  const n = findNote(noteId);
  if (!n) {
    // Brouillon : ne rien créer tant que tout est vide
    if (!hasContent) return;
    const created = {
      id: uid(),
      title: title || stripHtml(content).slice(0, 40) || 'Sans titre',
      content,
      tags,
      pinned: false,
      starred: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    notes.unshift(created);
    noteId = created.id;
    snapshot = sig(created);
    await storeSet({ [K_NOTES]: notes });
    return;
  }
  n.title = title || stripHtml(content).slice(0, 40) || 'Sans titre';
  n.content = content;
  n.tags = tags;
  n.updatedAt = Date.now();
  snapshot = sig(n);
  await storeSet({ [K_NOTES]: notes });
}

function scheduleSave() {
  setStatus('Enregistrement…', 'saving');
  clearTimeout(autosaveTimer);
  const ms = Math.min(10000, Math.max(200, settings.autosave || 1200));
  autosaveTimer = setTimeout(flushNow, ms);
}

async function flushNow() {
  clearTimeout(autosaveTimer);
  await persistNote();
  setStatus('À jour', 'saved');
  const ai = $('#autoInfo');
  if (ai) ai.textContent = 'Sauvegardé à ' + fmtTime(Date.now());
}

function handleEditorInput() {
  dirty = true;
  normalizeSizes();
  updateWordCount();
  scheduleSave();
}

async function toggleFlag(key) {
  if (!noteId) await flushNow(); // s'assure que la note existe avant de la marquer
  const n = findNote(noteId);
  if (!n) { showToast('Écrivez d’abord quelque chose'); return; }
  n[key] = !n[key];
  n.updatedAt = Date.now();
  await storeSet({ [K_NOTES]: notes });
  updatePinStar();
  showToast(key === 'pinned'
    ? (n.pinned ? 'Note épinglée 📌' : 'Note détachée')
    : (n.starred ? 'Ajoutée aux favoris ★' : 'Retirée des favoris'));
}

/* ---------- brouillon / suppression ---------- */

function startNewDraft() {
  clearTimeout(autosaveTimer);
  dirty = false;
  snapshot = '';
  noteId = null;
  $('#titleInput').value = '';
  $('#tagsInput').value = '';
  $('#editor').innerHTML = '';
  const ds = $('#deletedState');
  if (ds) ds.hidden = true;
  const doc = $('#doc');
  if (doc) doc.style.removeProperty('display');
  updateWordCount();
  updatePinStar();
  setStatus('Prêt');
  const ai = $('#autoInfo');
  if (ai) ai.textContent = '';
  $('#titleInput').focus();
}

async function deleteNote() {
  const id = noteId;
  if (!id) return;
  if (!await askConfirm({ title: 'Supprimer cette note ?', message: shortTitle(findNote(id)) + ' sera supprimée.' })) return;
  const i = notes.findIndex(n => n.id === id);
  if (i >= 0) {
    notes.splice(i, 1);
    await storeSet({ [K_NOTES]: notes });
  }
  noteId = null;
  clearTimeout(autosaveTimer);
  const doc = $('#doc');
  if (doc) doc.style.display = 'none';
  const ds = $('#deletedState');
  if (ds) ds.hidden = false;
  showToast('Note supprimée ✓');
}

/* ---------- navigation ---------- */

function goBack() {
  flushNow();
  if (history.length > 1) {
    history.back();
  } else {
    window.close();
    setTimeout(() => { location.href = api.runtime.getURL('popup/popup.html'); }, 200);
  }
}

/* ---------- feuille de travail ---------- */

function bindWorkspace() {
  const ws = $('#wsText');
  const st = $('#wsStatus');
  if (!ws) return;
  ws.addEventListener('input', () => {
    if (st) st.textContent = 'Enregistrement…';
    clearTimeout(wsTimer);
    wsTimer = setTimeout(async () => {
      await storeSet({ [K_WS]: ws.value });
      if (st) st.textContent = 'Enregistré à ' + fmtTime(Date.now());
    }, 800);
  });
  on('wsClearBtn', 'click', () => {
    ws.value = '';
    storeSet({ [K_WS]: '' });
    if (st) st.textContent = 'Effacé ✓';
    setTimeout(() => { if (st) st.textContent = ''; }, 1500);
  });
}

/* ---------- events ---------- */

function on(id, evt, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}

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
  on('titleInput', 'input', handleEditorInput);
  on('tagsInput', 'input', handleEditorInput);
  on('editor', 'input', handleEditorInput);
  on('titleInput', 'blur', flushNow);
  on('tagsInput', 'blur', flushNow);
  on('editor', 'blur', flushNow);

  on('pinBtn', 'click', () => toggleFlag('pinned'));
  on('starBtn', 'click', () => toggleFlag('starred'));
  on('delBtn', 'click', deleteNote);
  on('backBtn', 'click', goBack);
  on('toPopupBtn', 'click', () => { location.href = api.runtime.getURL('popup/popup.html'); });
  on('againBtn', 'click', () => {
    const doc = $('#doc');
    if (doc) doc.style.removeProperty('display');
    startNewDraft();
  });

  on('themeToggle', 'click', () => {
    const order = ['auto', 'light', 'dark'];
    settings.theme = order[(order.indexOf(settings.theme) + 1) % 3];
    storeSet({ [K_SETTINGS]: settings });
    applySettings();
  });

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
      const fmt = btn.dataset.format;
      const cmd = btn.dataset.cmd;
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
      $('#editor').focus();
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
    on('hlSel', 'change', e => {
      const v = e.target.value;
      if (v) { document.execCommand('hiliteColor', false, v); handleEditorInput(); }
      e.target.value = '';
    });
    on('fontSel', 'change', e => {
      const v = e.target.value;
      if (v) { document.execCommand('fontName', false, v); handleEditorInput(); }
      e.target.value = '';
    });
  }

  bindWorkspace();

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[K_SETTINGS]) {
      Object.assign(settings, changes[K_SETTINGS].newValue || {});
      applySettings();
    }
    if (changes[K_WS]) {
      const ws = $('#wsText');
      if (ws && document.activeElement !== ws) ws.value = changes[K_WS].newValue || '';
    }
    if (changes[K_NOTES]) {
      notes = changes[K_NOTES].newValue || [];
      const n = noteId ? findNote(noteId) : null;
      if (n && !dirty && sig(n) !== snapshot) {
        snapshot = sig(n);
        $('#titleInput').value = n.title || '';
        $('#tagsInput').value = (n.tags || []).join(', ');
        $('#editor').innerHTML = n.content || '';
        updateWordCount();
      }
      if (noteId && !n && !dirty) {
        // La note a été supprimée dans une autre vue
        clearTimeout(autosaveTimer);
        noteId = null;
        const doc = $('#doc');
        if (doc) doc.style.display = 'none';
        const ds = $('#deletedState');
        if (ds) ds.hidden = false;
      }
      updatePinStar();
    }
  });
}

/* ---------- init ---------- */

async function init() {
  const d = await storeGet({ [K_NOTES]: [], [K_SETTINGS]: settings, [K_WS]: '' });
  notes = d[K_NOTES] || [];
  settings = Object.assign(settings, d[K_SETTINGS] || {});
  const ws = $('#wsText');
  if (ws) ws.value = d[K_WS] || '';
  bind();
  applySettings();

  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    const n = findNote(id);
    if (!n) {
      const doc = $('#doc');
      if (doc) doc.style.display = 'none';
      const ds = $('#deletedState');
      if (ds) ds.hidden = false;
    } else {
      noteId = id;
      snapshot = sig(n);
      $('#titleInput').value = n.title || '';
      $('#tagsInput').value = (n.tags || []).join(', ');
      $('#editor').innerHTML = n.content || '';
      updatePinStar();
    }
  }

  updateWordCount();
  setStatus('Prêt');
  $('#titleInput').focus();
}

init();
