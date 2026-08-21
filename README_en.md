# Phi Theme Studio

[中文](./README.md)

A visual phi-plugin theme pack editor powered by [GrapesJS](https://github.com/GrapesJS/grapesjs). Edit result previews in the browser and export an installable theme ZIP without writing `info.yaml` by hand.

Live editor: [https://lyh2011.github.io/phi-theme-studio/](https://lyh2011.github.io/phi-theme-studio/)

New here? Open the in-app guide from the question mark button in the toolbar. A written walkthrough is available in Chinese: [使用指南](./docs/使用指南.md).

![Phi Theme Studio editor](./docs/editor.png)

## Features

- B19, B27, B30, B33 (Overflow), and B30 analysis states
- Independent visual CSS editing for daily sign-in, save update, challenge mode, Arcaea-style B19, suggestions, constant table, score list, B30 history, player info, plugin settings, user settings, constant history, and help pages
- Optional-element toggles reveal the conditional blocks phi-plugin only renders for certain saves or plugin settings: version notices, average ACC badges, constant comparisons, the no-signal placeholder, insufficient tag data, and the wide histogram layout
- GrapesJS selection and dragging of semantic result elements, emitted as stable runtime CSS selectors for phi-plugin
- The component index covers player info, score cards, conditional blocks, and analysis panels, and is searchable by name or selector
- Canvas zoom up to 300%, right-button panning, and fit-to-canvas controls
- Dragging and resizing for semantic and custom elements, with pointer movement compensated for the current canvas zoom; hold `Shift` to temporarily disable snapping
- Arrow keys nudge the selected element by one pixel, or ten while holding `Shift`
- Resize handles sit outside the selection, so even text elements barely a dozen pixels tall can be dragged without triggering an accidental resize
- Layout, typography, appearance, transforms, and SVG `fill`/`stroke` controls in the style panel; any element can layer image, solid-color, or gradient backgrounds and adjust each corner radius and overall opacity
- The style panel header shows an ancestor breadcrumb (click to select the containing element), the exported selector, and the override count, and can clear all overrides at once
- Every style control shows the selected element's computed default; these references do not create CSS overrides or enter exported packages
- Numeric font size, dimension, and position controls default to `px`, while rotation defaults to `deg`; units can be changed or supplied as complete CSS values
- Customizable multidimensional radar chart, tag rankings, histogram, and related analysis elements
- Custom text, rectangles, circles, triangles, and lines via click or sidebar drag-and-drop, plus uploaded image elements
- Preview defaults to phi-plugin's PHI font and allows a packaged theme font to override it
- Theme metadata and live AT/IN/HD/EZ preview color controls
- Background, font, and rating icon asset management
- Import legacy single-page and current multi-page phi-plugin theme ZIP files
- Export directly extractable multi-page `resources/html/b19/themes/` packages whose page styles load as overlays
- Per-page editable state stored in `studio.json` v2 for later re-import
- IndexedDB autosave, undo/redo, and advanced source editing
- CSS, asset path, ZIP Slip, file count, and size validation
- Untrusted `studio.json` script filtering and decompressed ZIP size limits
- Responsive desktop and mobile workbench

## Development

```bash
npm install
npm run dev
```

The development server is available at `http://localhost:5173` by default.

1. Choose a phi-plugin page from the first tab row; B19 also exposes its five result states in a second row. Select or drag a semantic element, then edit its layout, size, color, and appearance in the Style panel.
2. To style a conditional block, enable its state under Optional Elements in the preview bar; the element then appears on the canvas and behaves like any other selection.
3. At enlarged zoom levels, hold the right mouse button and drag to pan into areas outside the workbench. Click the zoom percentage or Fit Canvas to recenter.
4. Search the Components panel by element name or selector, add text and basic shapes under Custom Elements, or upload a local image directly onto the canvas.
5. Configure metadata and packaged assets, then export the validated ZIP and extract it to `resources/html/b19/themes/`.

## Export Format

```text
my-theme/
├── info.yaml
├── b19.css
├── pages/
│   ├── sign-sign.css
│   ├── setting-userSetting.css
│   └── ...                 # one overlay per standalone page
├── b19.art                 # generated for canvas custom elements or an advanced template
├── studio.json
└── assets/
    ├── background.webp
    ├── font.woff2
    ├── custom/
    │   └── image.png
    ├── elements/
    │   └── background.png
    └── rating/
        ├── FC.png
        └── phi.png
```

### Page CSS Overlays

Current theme packages assign stylesheets per page in `info.yaml`:

```yaml
css:
  b19: b19.css
  sign: sign.css
  setting/userSetting: setting-userSetting.css
```

phi-plugin loads the original page CSS first and the matching theme CSS afterward. Exported page stylesheets therefore contain only theme rules and do not start with an `@import` of the original `b19.css` or `common.css`. Pages without a CSS entry retain the original styles and font; the theme font is enabled only on pages with configured CSS. Theme backgrounds, difficulty colors, and rating icons remain available on pages without CSS entries.

The five B19 states share `b19.css`; every other page keeps its own stylesheet, so switching pages cannot leak rules between canvases. `studio.json` v2 records all page states and is ignored by phi-plugin. Legacy v1 projects remain importable; their old imports or inlined base blocks are stripped as compatibility content during import.

Difficulty colors, theme fonts, and backgrounds are not written into the CSS: phi-plugin injects `:root { --AT/--IN/--HD/--EZ }` and `@font-face` from `info.yaml` in `common/layout/default.art`.

Text, shapes, and images added to the canvas are stored in `studio.json` and injected into a real exported `b19.art`, so they are present in phi-plugin renders rather than only in the editor project. Uploaded images are packaged under `assets/custom/` and referenced through `{{themeInfo.baseUrl}}`. The manifest automatically receives `template: b19.art` in this case.

On the B19 page, custom `b19.art` files are preserved as opaque source because GrapesJS cannot safely round-trip ArtTemplate control statements such as `{{each}}` and `{{if}}`. The visual canvas edits the fixed expanded preview structure and its CSS rather than template control flow. Other pages keep the plugin-provided ArtTemplate and expose CSS-only editing.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:pages
npm run build
```

Set `VITE_BASE_PATH` when building for a repository subpath:

```bash
VITE_BASE_PATH=/phi-theme-studio/ npm run build
```

## License

Licensed under [GPL-3.0](./LICENSE). The preview structure, base styles, and demo assets are derived from [Catrong/phi-plugin](https://github.com/Catrong/phi-plugin); see [NOTICE](./NOTICE). GrapesJS is distributed under the BSD-3-Clause license.
