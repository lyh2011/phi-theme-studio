# Phi Theme Studio

[中文](./README.md)

A visual phi-plugin theme pack editor powered by [GrapesJS](https://github.com/GrapesJS/grapesjs). Edit a B30 preview in the browser and export an installable theme ZIP without writing `info.yaml` by hand.

Live editor: [https://lyh2011.github.io/phi-theme-studio/](https://lyh2011.github.io/phi-theme-studio/)

![Phi Theme Studio editor](./docs/editor.png)

## Features

- GrapesJS B30 canvas, layer tree, and style inspector
- Theme metadata and AT/IN/HD/EZ color controls
- Background, font, and rating icon asset management
- Import existing phi-plugin theme ZIP files
- Export directly extractable `resources/html/b19/themes/` packages
- Lossless GrapesJS project restoration through `studio.json`
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

## Export Format

```text
my-theme/
├── info.yaml
├── b19.css
├── studio.json
└── assets/
    ├── background.webp
    ├── font.woff2
    └── rating/
        ├── FC.png
        └── phi.png
```

The generated stylesheet imports the current phi-plugin base stylesheet:

```css
@import "../../b19.css";
```

This keeps the default export compatible with upstream B30 template changes. `studio.json` is ignored by phi-plugin and is only used to restore the editor project.

Custom `b19.art` files are preserved as opaque source because GrapesJS cannot safely round-trip ArtTemplate control statements such as `{{each}}` and `{{if}}`.

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
