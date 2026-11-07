# Graph Report - quikT4  (2026-11-07)

## Corpus Check
- Corpus is ~9,548 words - fits in a single context window. You may not need a graph.

## Summary
- 177 nodes · 383 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 89% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Editor & UI
- Storage & Data
- Web Capture
- Visual Assets
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12

## God Nodes (most connected - your core abstractions)
1. `bind()` - 30 edges
2. `bind()` - 20 edges
3. `render()` - 16 edges
4. `findNote()` - 13 edges
5. `saveNotes()` - 10 edges
6. `init()` - 9 edges
7. `persistSidebarNote()` - 9 edges
8. `delNote()` - 9 edges
9. `openEditor()` - 9 edges
10. `deleteCurrent()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `bind()` --indirect_call--> `handleEditorInput()`  [INFERRED]
  popup/popup.js → popup/popup.js  _Bridges community 4 → community 6_
- `bind()` --indirect_call--> `addTag()`  [INFERRED]
  popup/popup.js → popup/popup.js  _Bridges community 7 → community 6_
- `bind()` --indirect_call--> `deleteCurrent()`  [INFERRED]
  popup/popup.js → popup/popup.js  _Bridges community 9 → community 6_
- `saveNotes()` --calls--> `storeSet()`  [EXTRACTED]
  popup/popup.js → popup/popup.js  _Bridges community 8 → community 7_
- `delNote()` --calls--> `saveNotes()`  [EXTRACTED]
  popup/popup.js → popup/popup.js  _Bridges community 7 → community 9_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Storage Management** — storage_local, k_notes, background_js [5]
- **Capture System** — context_menus, background_js, note_entity [5]
- **Editor UI System** — editor_html, editor_js, editor_view [5]
- **List UI System** — popup_html, popup_js, list_view [5]

## Communities (13 total, 1 thin omitted)

### Community 0 - "Editor & UI"
Cohesion: 0.15
Nodes (37): applySettings(), applySize(), applyTheme(), askConfirm(), bind(), bindWorkspace(), cleanSizeSpans(), clearFormatting() (+29 more)

### Community 1 - "Storage & Data"
Cohesion: 0.07
Nodes (31): author, background, scripts, browser_action, default_icon, default_title, browser_specific_settings, gecko (+23 more)

### Community 2 - "Web Capture"
Cohesion: 0.12
Nodes (18): background.js, browser.browserAction, confirmModal, browser.contextMenus, editor.html, editor.js, editorView, K_NOTES (+10 more)

### Community 3 - "Visual Assets"
Cohesion: 0.21
Nodes (15): ACCENTS, card(), DEFAULTS, esc(), fmt(), hl(), notes, plural() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.18
Nodes (17): applySize(), cleanSizeSpans(), clearFormatting(), convertSizeFonts(), flushNow(), handleEditorInput(), normalizeSizes(), openEditor() (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (6): buildNote(), clean(), esc(), fromUrlBits(), linkHtml(), uid()

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (11): bind(), closeModal(), exportAll(), flagCurrent(), newNote(), on(), showList(), showToast() (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.36
Nodes (9): addTag(), dupNote(), importAll(), normalizeTag(), render(), saveNotes(), togglePin(), toggleStar() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (9): applyColors(), applySettings(), applyTheme(), buildAccentRow(), hexToRgb(), main(), saveSettings(), storeGet() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.53
Nodes (6): askConfirm(), deleteCurrent(), delNote(), findNote(), shortTitle(), undoPrompt()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (4): quikT4, quikT4 Icon, Dark Background, Stylized 'q'

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (3): App Icon File, Color Palette, quikT4 Logo

## Knowledge Gaps
- **25 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `author` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bind()` connect `Community 6` to `Visual Assets`, `Community 4`, `Community 7`, `Community 8`, `Community 9`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `bind()` (e.g. with `addTag()` and `closeModal()`) actually correct?**
  _`bind()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `bind()` (e.g. with `deleteNote()` and `flushNow()`) actually correct?**
  _`bind()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Editor & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.14509246088193456 - nodes in this community are weakly interconnected._
- **Should `Storage & Data` be split into smaller, more focused modules?**
  _Cohesion score 0.06653225806451613 - nodes in this community are weakly interconnected._
- **Should `Web Capture` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._