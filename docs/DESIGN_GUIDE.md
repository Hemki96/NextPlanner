# Design Guide & UI‑Kit (NextPlanner)

Dieser Guide beschreibt das UI‑Kit, das in der gesamten Anwendung verwendet wird. Die Klassen sind in `public/css/main.css` definiert und werden in den HTML‑Seiten unter `public/*.html` eingesetzt.

## 1) Design‑Tokens

Die zentralen Tokens liegen in `:root` und `:root[data-theme="dark"]`:

**Farben**
- `--bg`, `--bg-panel`, `--bg-muted`
- `--text-primary`, `--text-secondary`
- `--accent`, `--accent-soft`, `--accent-strong`
- `--success`, `--warning`, `--danger`
- `--border`, `--border-strong`

**Schatten**
- `--shadow-soft` (dezente Cards)
- `--shadow-lift` (angehobene Cards/Overlays)

**Formulare & Fokus**
- `--input-bg`, `--input-bg-focus`
- `--focus-ring`

**Radien & Spacing**
- `--radius-sm`, `--radius-md`, `--radius-lg`
- `--space-1` bis `--space-8`

**Typography‑Skala**
- `--font-size-xs` bis `--font-size-xl`

## 2) UI‑Kit Komponenten

### Karten / Oberflächen
Verwende `ui-card` auf Sektionen/Containern, z. B.:
```html
<section class="page-card ui-card">
  ...
</section>
```

Für sekundäre Flächen nutze `ui-surface-muted`:
```html
<div class="ui-surface-muted">
  ...
</div>
```

### Buttons
Die Basis ist `ui-button` plus Variante:
- `ui-button--primary`
- `ui-button--secondary`
- `ui-button--ghost`
- `ui-button--danger`

Beispiel:
```html
<button class="primary-button ui-button ui-button--primary">Speichern</button>
<button class="ghost-button ui-button ui-button--ghost">Abbrechen</button>
```

### Formulare
Nutze die UI‑Kit‑Klassen auf Inputs:
- `ui-input` (Textfelder, Suche, Zahl)
- `ui-select`
- `ui-textarea`

Beispiel:
```html
<label class="form-field">
  <span>Titel</span>
  <input class="ui-input" type="text" />
</label>
```

### Layout‑Hilfen
- `page-header`, `page-content`, `section-header`, `section-actions`
- `form-grid`, `form-field`, `form-actions`
- `form-actions dialog-actions` für konsistente Dialog‑Buttons

### Progressive Disclosure
In Settings/Admin werden `details.section-collapsible` verwendet, um lange Abschnitte einklappbar zu machen:
```html
<details class="page-card ui-card section-collapsible" open>
  <summary class="section-collapsible-summary">Abschnitt</summary>
  <div class="section-collapsible-body">...</div>
</details>
```

### Filter‑Chips
Aktive Filter werden als Chips angezeigt:
```html
<div class="filter-chip-list">
  <button class="filter-chip"><span class="filter-chip__label">Tag: Sprint</span> ✕</button>
</div>
```

## 3) Anwendungs‑Patterns

- **Header + Navigation:** `page-header` mit `page-nav` und `nav-link`.
- **Primäre Aktionen:** `ui-button--primary`.
- **Sekundäre Aktionen:** `ui-button--secondary`.
- **Nicht‑kritische Aktionen:** `ui-button--ghost`.
- **Formulare:** `form-grid` + `form-field` + `ui-input`/`ui-textarea`.

## 4) Do / Don’t

✅ Nutze die vorhandenen Tokens und UI‑Kit‑Klassen statt Einzel‑Styles.

❌ Keine ID‑Selektoren für Styling, keine `!important`.

## 5) Erweiterung

Neue Komponenten sollten:
1. Tokens in `:root` wiederverwenden.
2. Als Klasse in `main.css` dokumentiert werden.
3. In mindestens einer Seite in `public/*.html` eingesetzt werden.
