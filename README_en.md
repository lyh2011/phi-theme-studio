# Phi Theme Studio

[中文](./README.md)

A visual phi-plugin theme pack editor powered by [GrapesJS](https://github.com/GrapesJS/grapesjs). Edit result previews in the browser and export an installable theme ZIP without writing `info.yaml` by hand.

Live editor: [https://lyh2011.github.io/phi-theme-studio/](https://lyh2011.github.io/phi-theme-studio/)

![Phi Theme Studio editor](./docs/editor.png)

## Features

- B19, B27, B30, B33 (Overflow), and B30 analysis previews
- GrapesJS selection and dragging of semantic result elements, emitted as stable runtime CSS selectors for phi-plugin
- Right-button canvas panning after zooming, plus toolbar zoom and fit-to-canvas controls
- Dragging and resizing for semantic and custom elements, with pointer movement compensated for the current canvas zoom; hold `Shift` to temporarily disable snapping
- Layout, typography, appearance, transforms, and SVG `fill`/`stroke` controls in the style panel, including native color pickers
- Customizable multidimensional radar chart, tag rankings, histogram, and related analysis elements
- Custom text, rectangles, circles, triangles, lines, and uploaded image elements
- Theme metadata and live AT/IN/HD/EZ preview color controls
- Background, font, and rating icon asset management
- Import existing phi-plugin theme ZIP files
- Export directly extractable `resources/html/b19/themes/` packages
- Editable project configuration stored in `studio.json` for later re-import
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

1. Switch between result previews, select or drag a semantic element, and edit its layout, size, color, and appearance in the Style panel. Hold `Shift` while dragging for pointer-exact positioning without snapping.
2. At enlarged zoom levels, hold the right mouse button and drag to pan into areas outside the workbench. Click the zoom percentage or Fit Canvas to recenter.
3. Add text and basic shapes under Components > Custom Elements, or upload a local image directly onto the canvas.
4. Configure metadata and packaged assets, then export the validated ZIP and extract it to `resources/html/b19/themes/`.

## Export Format

```text
my-theme/
├── info.yaml
├── b19.css
├── b19.art                 # generated for canvas custom elements or an advanced template
├── studio.json
└── assets/
    ├── background.webp
    ├── font.woff2
    ├── custom/
    │   └── image.png
    └── rating/
        ├── FC.png
        └── phi.png
```

The generated stylesheet imports the current phi-plugin base stylesheet:

```css
@import "../../b19.css";
```

Without custom canvas elements, this keeps the default export based on the current phi-plugin result template and base styles. All five previews share the same theme CSS. `studio.json` is ignored by phi-plugin and is only used to restore editable configuration in the studio.

Text, shapes, and images added to the canvas are stored in `studio.json` and injected into a real exported `b19.art`, so they are present in phi-plugin renders rather than only in the editor project. Uploaded images are packaged under `assets/custom/` and referenced through `{{themeInfo.baseUrl}}`. The manifest automatically receives `template: b19.art` in this case.

Custom `b19.art` files are preserved as opaque source because GrapesJS cannot safely round-trip ArtTemplate control statements such as `{{each}}` and `{{if}}`. The visual canvas edits the fixed expanded preview structure and its CSS rather than template control flow. When canvas custom elements exist, the editor appends their markup to the preserved source during export; if no custom template was supplied, it generates one from the real bundled phi-plugin template.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Set `VITE_BASE_PATH` when building for a repository subpath:

```bash
VITE_BASE_PATH=/phi-theme-studio/ npm run build
```

## License

Licensed under [GPL-3.0](./LICENSE). The preview structure, base styles, and demo assets are derived from [Catrong/phi-plugin](https://github.com/Catrong/phi-plugin); see [NOTICE](./NOTICE). GrapesJS is distributed under the BSD-3-Clause license.
