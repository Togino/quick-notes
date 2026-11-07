'use strict';

const api = typeof browser !== 'undefined' ? browser : chrome;

const K_NOTES = 'quick-notes.notes';

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Le contenu d'une note est du HTML : tout texte venu d'une page doit être échappé.
function linkHtml(u) {
  return /^(https?|ftp|mailto):/i.test(u)
    ? '<a href="' + esc(u) + '">' + esc(u) + '</a>'
    : esc(u);
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function createMenu() {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: 'qn-snap',
      title: 'Quick Notes : Capturer la page',
      contexts: ['page']
    });
    api.contextMenus.create({
      id: 'qn-selection',
      title: 'Quick Notes : Capturer la sélection',
      contexts: ['selection']
    });
    api.contextMenus.create({
      id: 'qn-link',
      title: 'Quick Notes : Mémoriser le lien',
      contexts: ['link']
    });
  });
}

api.runtime.onInstalled.addListener(createMenu);
api.runtime.onStartup.addListener(createMenu);

function toggleSidebar() {
  if (!api.sidebarAction) return;
  if (typeof api.sidebarAction.toggle === 'function') {
    api.sidebarAction.toggle();
  } else if (typeof api.sidebarAction.open === 'function') {
    api.sidebarAction.open().catch(() => {});
  }
}

if (api.browserAction) api.browserAction.onClicked.addListener(toggleSidebar);

function buildNote(info, tab) {
  const title = clean(tab && tab.title ? tab.title : 'Page capturée');
  const url = clean(tab && tab.url);
  const parts = [];

  if (info.menuItemId === 'qn-selection' && info.selectionText) {
    parts.push('<p>' + esc(String(info.selectionText).trim()).replace(/\r?\n/g, '<br>') + '</p>');
  } else if (info.menuItemId === 'qn-link' && info.linkUrl) {
    parts.push('<p>' + linkHtml(clean(info.linkUrl)) + '</p>');
  }
  if (url) parts.push('<p>' + linkHtml(url) + '</p>');
  const content = parts.join('');

  return {
    id: uid(),
    title,
    content,
    tags: fromUrlBits(url),
    pinned: false,
    starred: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function fromUrlBits(url) {
  const tags = [];
  try {
    const u = new URL(url);
    if (u.hostname) tags.push(u.hostname.replace(/^www\./, ''));
  } catch (e) { /* ignore */ }
  return tags;
}

async function setBadgeCount() {
  if (!api.browserAction) return;
  try {
    const d = await new Promise(r => api.storage.local.get({ [K_NOTES]: [] }, r));
    const count = (d[K_NOTES] || []).length;
    api.browserAction.setBadgeText({ text: count > 0 ? String(count) : '' });
    api.browserAction.setBadgeBackgroundColor({ color: '#6366f1' });
  } catch (e) { /* noop */ }
}

async function saveNote(note) {
  const d = await new Promise(r => api.storage.local.get({ [K_NOTES]: [] }, r));
  const arr = d[K_NOTES] || [];
  arr.unshift(note);
  await new Promise(r => api.storage.local.set({ [K_NOTES]: arr }, r));
}

api.contextMenus.onClicked.addListener((info, tab) => {
  const note = buildNote(info, tab);
  if (!note) return;
  saveNote(note).catch(() => {});
});

setBadgeCount();

if (api.storage.onChanged) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[K_NOTES]) setBadgeCount();
  });
}