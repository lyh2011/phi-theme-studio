import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import YAML from "yaml";
import {
  exportThemePackage,
  importThemePackage,
  mapProjectAssetUrls,
  normalizeRenderTarget,
  resolvePageCss,
  rewriteCssUrls,
  validateTheme,
  validateThemeCss,
} from "./themePackage";
import {
  DEFAULT_DRAFT,
  DEFAULT_RESOURCES,
  type PackageAsset,
} from "../types/theme";
import { collectCustomNodes } from "../editor/customElements";

const projectData = {
  pages: [{ frames: [{ component: { type: "wrapper", components: [] } }] }],
  styles: [],
};

describe("theme package validation", () => {
  it("accepts a minimal CSS override theme", () => {
    const issues = validateTheme({
      draft: DEFAULT_DRAFT,
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song { border-radius: 4px; }",
      customTemplate: "",
    });
    expect(issues.some((issue) => issue.level === "error")).toBe(false);
    expect(
      issues.some((issue) => issue.message.includes("内置 B30 模板")),
    ).toBe(true);
  });

  it("rejects reserved ids and remote CSS resources", () => {
    const issues = validateTheme({
      draft: { ...DEFAULT_DRAFT, id: "default" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: '.song { background: url("https://example.com/a.png"); }',
      customTemplate: "",
    });
    expect(issues.filter((issue) => issue.level === "error")).toHaveLength(2);
    expect(() =>
      validateThemeCss('@import "https://example.com/a.css";'),
    ).toThrow(/不能包含 @import/);
    expect(() =>
      validateThemeCss(
        ".song { background: u\\72l(\\68ttps\\3a//example.com/a.png); }",
      ),
    ).toThrow(/不安全/);
    expect(() =>
      validateThemeCss(
        '.song { background: image-set("https://example.com/a.png" 1x); }',
      ),
    ).toThrow(/不安全/);
    expect(() => validateThemeCss("#i390l { color: red; }")).toThrow(/临时 ID/);
  });

  it("validates the final b19.art against packaged assets", () => {
    const input = {
      draft: DEFAULT_DRAFT,
      resources: DEFAULT_RESOURCES,
      assets: [] as PackageAsset[],
      css: "",
    };
    const blobIssues = validateTheme({
      ...input,
      customTemplate: '<img src="blob:orphan">',
    });
    const missingIssues = validateTheme({
      ...input,
      customTemplate:
        '<img src="{{themeInfo.baseUrl}}assets/custom/missing.png">',
    });

    expect(
      blobIssues.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("blob:orphan"),
      ),
    ).toBe(true);
    expect(
      missingIssues.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("不存在的资源"),
      ),
    ).toBe(true);
  });

  it("rejects assets that cannot be exported as a safe, re-importable package", async () => {
    const asset = (path: string, size = 1): PackageAsset => ({
      path,
      mime: "image/png",
      bytes: new Uint8Array(size),
      previewUrl: `blob:${path}`,
    });
    const input = {
      draft: DEFAULT_DRAFT,
      resources: DEFAULT_RESOURCES,
      css: "",
      customTemplate: "",
    };

    const unsafe = validateTheme({
      ...input,
      assets: [asset("../outside.png")],
    });
    const reserved = validateTheme({ ...input, assets: [asset("info.yaml")] });
    const duplicate = validateTheme({
      ...input,
      assets: [asset("assets/a.png"), asset("assets/a.png")],
    });
    const unsupported = validateTheme({
      ...input,
      assets: [asset("assets/a.exe")],
    });
    const oversized = validateTheme({
      ...input,
      assets: [asset("assets/large.png", 20 * 1024 * 1024 + 1)],
    });
    const tooMany = validateTheme({
      ...input,
      assets: Array.from({ length: 126 }, (_, index) =>
        asset(`assets/${index}.png`),
      ),
    });

    expect(
      unsafe.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("路径不安全"),
      ),
    ).toBe(true);
    expect(
      reserved.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("内置文件冲突"),
      ),
    ).toBe(true);
    expect(
      duplicate.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("路径重复"),
      ),
    ).toBe(true);
    expect(
      unsupported.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("文件类型"),
      ),
    ).toBe(true);
    expect(
      oversized.some(
        (issue) => issue.level === "error" && issue.message.includes("20 MB"),
      ),
    ).toBe(true);
    expect(
      tooMany.some(
        (issue) =>
          issue.level === "error" && issue.message.includes("文件数超过 128"),
      ),
    ).toBe(true);
    await expect(
      exportThemePackage({
        ...input,
        assets: [asset("info.yaml")],
        projectData,
      }),
    ).rejects.toThrow(/内置文件冲突/);
  });

  it("rejects an export whose editable source cannot rebuild its final template", async () => {
    await expect(
      exportThemePackage({
        draft: DEFAULT_DRAFT,
        resources: DEFAULT_RESOURCES,
        assets: [],
        css: "",
        customTemplate: "<main>final</main>",
        templateSource: "<main>source</main>",
        projectData,
      }),
    ).rejects.toThrow(/模板来源与最终 b19\.art 不一致/);
  });

  it("rewrites only parsed url values", () => {
    const css = '.song { background: url("blob:test"); content: "blob:test"; }';
    expect(
      rewriteCssUrls(css, (url) =>
        url === "blob:test" ? "assets/bg.png" : url,
      ),
    ).toContain('url("assets/bg.png")');
    expect(rewriteCssUrls(css, (url) => url)).toContain('content: "blob:test"');
  });
});

describe("theme package round trip", () => {
  it("exports a directly extractable package and imports it again", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const asset: PackageAsset = {
      path: "assets/background.png",
      mime: "image/png",
      bytes,
      previewUrl: "blob:background",
    };
    const draft = {
      ...DEFAULT_DRAFT,
      id: "round-trip",
      name: "Round Trip",
      author: "Tester",
    };
    const resources = { ...DEFAULT_RESOURCES, background: asset.path };
    const blob = await exportThemePackage({
      draft,
      resources,
      assets: [asset],
      css: ".song { border-radius: 3px; }",
      customTemplate: "",
      projectData,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("round-trip/info.yaml")).toBeTruthy();
    expect(zip.file("round-trip/b19.css")).toBeTruthy();
    expect(zip.file("round-trip/studio.json")).toBeTruthy();
    expect(zip.file("round-trip/assets/background.png")).toBeTruthy();

    const yaml = YAML.parse(
      await zip.file("round-trip/info.yaml")!.async("string"),
    );
    expect(yaml).toMatchObject({
      id: "round-trip",
      name: "Round Trip",
      Author: "Tester",
      css: "b19.css",
    });
    const css = await zip.file("round-trip/b19.css")!.async("string");
    expect(css).toMatch(/^@import "\.\.\/\.\.\/b19\.css";/);
    expect(css).toContain(".rank-AT { background-color: var(--AT); }");
    expect(css).toContain(
      ".info-IN { background-color: color-mix(in srgb, var(--IN) 30%, transparent); border-color: var(--IN); }",
    );
    expect(css.indexOf(".rank-AT")).toBeLessThan(
      css.indexOf(".song { border-radius: 3px; }"),
    );

    const imported = await importThemePackage(
      new File([blob], "round-trip.zip", { type: "application/zip" }),
    );
    expect(imported.draft.id).toBe("round-trip");
    expect(imported.resources.background).toBe("assets/background.png");
    expect(imported.assets[0].bytes).toEqual(bytes);
    expect(imported.css).toContain("border-radius: 3px");
    expect(imported.css).not.toContain("phi-theme-studio:difficulty-colors");
    expect(imported.exportMode).toBe("override");
    for (const importedAsset of imported.assets)
      URL.revokeObjectURL(importedAsset.previewUrl);
  });

  it("round-trips a background image applied to an arbitrary element", async () => {
    const asset: PackageAsset = {
      path: "assets/elements/card.png",
      mime: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
      previewUrl: "blob:card",
    };
    const css = [
      ".song {",
      '  background-image: url("blob:card");',
      "  background-size: cover;",
      "  border-radius: 12px;",
      "  opacity: 0.85;",
      "}",
    ].join("\n");
    const backgroundProject = {
      ...projectData,
      styles: [
        {
          selectors: ["song"],
          style: {
            "background-image": 'url("blob:card")',
            "background-size": "cover",
            "border-radius": "12px",
            opacity: "0.85",
          },
        },
      ],
    };
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "element-background" },
      resources: DEFAULT_RESOURCES,
      assets: [asset],
      css,
      customTemplate: "",
      projectData: backgroundProject,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(
      zip.file("element-background/assets/elements/card.png"),
    ).toBeTruthy();
    const packagedCss = await zip
      .file("element-background/b19.css")!
      .async("string");
    expect(packagedCss).toContain(
      'background-image: url("assets/elements/card.png")',
    );
    expect(packagedCss).not.toContain("blob:card");

    const studioText = await zip
      .file("element-background/studio.json")!
      .async("string");
    const studio = JSON.parse(studioText);
    expect(studioText).not.toContain("blob:card");
    expect(studio.css).toContain(
      'background-image: url("assets/elements/card.png")',
    );
    expect(studio.projectData.styles).toEqual([]);
    expect(JSON.stringify(studio.projectData)).not.toContain("song");

    let imported: Awaited<ReturnType<typeof importThemePackage>> | undefined;
    try {
      imported = await importThemePackage(
        new File([blob], "element-background.zip", { type: "application/zip" }),
      );
      const importedAsset = imported.assets.find(
        (candidate) => candidate.path === asset.path,
      );
      expect(importedAsset).toBeTruthy();
      expect(imported.css).toContain(
        'background-image: url("assets/elements/card.png")',
      );
      expect(imported.css).not.toContain("blob:card");

      expect((imported.projectData as { styles?: unknown[] }).styles).toEqual([]);
    } finally {
      for (const importedAsset of imported?.assets ?? [])
        URL.revokeObjectURL(importedAsset.previewUrl);
    }
  });

  it("inlines the phi-plugin base stylesheet in standalone mode and strips it on import", async () => {
    const draft = { ...DEFAULT_DRAFT, id: "standalone-theme" };
    const blob = await exportThemePackage({
      draft,
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song { border-radius: 3px; }",
      exportMode: "standalone",
      customTemplate: "",
      projectData,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const css = await zip.file("standalone-theme/b19.css")!.async("string");

    // The shared stylesheet is three levels up, matching the bundled milthm theme.
    expect(css).toMatch(/^@import "\.\.\/\.\.\/\.\.\/common\/common\.css";/);
    expect(css).not.toContain('@import "../../b19.css"');
    expect(css).toContain("phi-theme-studio:base-styles:start");
    // Base layout rules travel with the package instead of being imported.
    expect(css).toContain(".song {");
    expect(css).toContain(".b30-analysis-row");
    expect(css.indexOf("phi-theme-studio:base-styles:end")).toBeLessThan(
      css.indexOf(".song { border-radius: 3px; }"),
    );

    const studio = JSON.parse(
      await zip.file("standalone-theme/studio.json")!.async("string"),
    );
    expect(studio.exportMode).toBe("standalone");
    // studio.json keeps only the author's overrides, never the inlined base.
    expect(studio.css).toBe(".song { border-radius: 3px; }");

    const imported = await importThemePackage(
      new File([blob], "standalone.zip", { type: "application/zip" }),
    );
    expect(imported.exportMode).toBe("standalone");
    expect(imported.css).toBe(".song { border-radius: 3px; }");
    expect(imported.css).not.toContain("phi-theme-studio:base-styles");
    expect(imported.css).not.toContain(".b30-analysis-row");
    for (const importedAsset of imported.assets)
      URL.revokeObjectURL(importedAsset.previewUrl);
  });

  it("exports custom canvas elements as a real template and restores them on import", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const asset: PackageAsset = {
      path: "assets/custom/badge.png",
      mime: "image/png",
      bytes,
      previewUrl: "blob:badge",
    };
    const customProject = {
      pages: [
        {
          frames: [
            {
              component: {
                type: "wrapper",
                components: [
                  {
                    tagName: "div",
                    type: "text",
                    classes: ["phi-custom-text-test"],
                    attributes: {
                      class: "phi-custom-text-test",
                      "data-phi-selector": ".phi-custom-text-test",
                      "data-phi-custom": "text",
                    },
                    content: "Custom result label",
                  },
                  {
                    tagName: "img",
                    type: "image",
                    classes: ["phi-custom-image-test"],
                    attributes: {
                      class: "phi-custom-image-test",
                      "data-phi-selector": ".phi-custom-image-test",
                      "data-phi-custom": "image",
                      src: asset.path,
                      alt: "Custom badge",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      styles: [],
    };
    const { templateForProject } = await import("../editor/customElements");
    const templateSource = "";
    const template = templateForProject(
      templateSource,
      customProject,
      new Set([asset.path]),
    );
    const draft = {
      ...DEFAULT_DRAFT,
      id: "custom-elements",
      name: "Custom Elements",
    };
    const blob = await exportThemePackage({
      draft,
      resources: DEFAULT_RESOURCES,
      assets: [asset],
      css: ".phi-custom-text-test { color: #fff; }",
      customTemplate: template,
      templateSource,
      projectData: customProject,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const yaml = YAML.parse(
      await zip.file("custom-elements/info.yaml")!.async("string"),
    );
    const art = await zip.file("custom-elements/b19.art")!.async("string");

    expect(yaml.template).toBe("b19.art");
    expect(zip.file("custom-elements/assets/custom/badge.png")).toBeTruthy();
    expect(art).toContain('class="phi-custom-text-test"');
    expect(art).toContain('<img class="phi-custom-image-test"');
    expect(art).toContain('src="{{themeInfo.baseUrl}}assets/custom/badge.png"');
    expect(art).not.toContain("blob:");
    expect(
      await zip.file("custom-elements/b19.css")!.async("string"),
    ).toContain(".phi-custom-text-test");

    const imported = await importThemePackage(
      new File([blob], "custom-elements.zip", { type: "application/zip" }),
    );
    expect(imported.customTemplate).toBe("");
    expect(imported.projectData).toBeTruthy();
    expect(imported.assets).toHaveLength(1);

    const portableProject = mapProjectAssetUrls(
      imported.projectData!,
      new Map(
        imported.assets.map((importedAsset) => [
          importedAsset.previewUrl,
          importedAsset.path,
        ]),
      ),
    );
    expect(
      templateForProject(
        imported.customTemplate,
        portableProject,
        new Set([asset.path]),
      ),
    ).toBe(template);

    const cleanBlob = await exportThemePackage({
      draft: { ...draft, id: "custom-elements-clean" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".phi-custom-text-test { color: #fff; } .song { opacity: .9; }",
      customTemplate: templateForProject(imported.customTemplate, projectData),
      templateSource: imported.customTemplate,
      projectData: {
        ...projectData,
        styles: [
          { selectors: ["phi-custom-text-test"], style: { color: "#fff" } },
          { selectors: ["song"], style: { opacity: ".9" } },
        ],
      },
    });
    const cleanZip = await JSZip.loadAsync(await cleanBlob.arrayBuffer());
    const cleanYaml = YAML.parse(
      await cleanZip.file("custom-elements-clean/info.yaml")!.async("string"),
    );
    const cleanStudio = await cleanZip
      .file("custom-elements-clean/studio.json")!
      .async("string");
    const cleanCss = await cleanZip
      .file("custom-elements-clean/b19.css")!
      .async("string");
    expect(cleanYaml.template).toBeUndefined();
    expect(cleanZip.file("custom-elements-clean/b19.art")).toBeNull();
    expect(cleanStudio).not.toContain("phi-theme-studio custom elements");
    expect(cleanStudio).not.toContain("phi-custom-text-test");
    expect(cleanStudio).not.toContain('"song"');
    expect(cleanCss).not.toContain("phi-custom-text-test");
    expect(cleanCss).toContain(".song { opacity: .9; }");
    for (const importedAsset of imported.assets)
      URL.revokeObjectURL(importedAsset.previewUrl);
  });

  it("round-trips templateSource only when it rebuilds the packaged b19.art", async () => {
    const { templateForProject } = await import("../editor/customElements");
    const source = '{{block "main"}}\n<main>custom source</main>\n{{/block}}';
    const customProject = {
      pages: [
        {
          frames: [
            {
              component: {
                type: "wrapper",
                components: [
                  {
                    tagName: "div",
                    classes: ["phi-custom-text-source"],
                    attributes: {
                      class: "phi-custom-text-source",
                      "data-phi-custom": "text",
                      "data-phi-selector": ".phi-custom-text-source",
                    },
                    content: "generated element",
                  },
                ],
              },
            },
          ],
        },
      ],
      styles: [],
    };
    const finalTemplate = templateForProject(source, customProject);
    const draft = {
      ...DEFAULT_DRAFT,
      id: "template-source",
      name: "Template Source",
    };
    const blob = await exportThemePackage({
      draft,
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: "",
      customTemplate: finalTemplate,
      templateSource: source,
      projectData: customProject,
    });
    const imported = await importThemePackage(
      new File([blob], "template-source.zip"),
    );
    expect(imported.customTemplate).toBe(source);
    expect(imported.projectData).toBeTruthy();

    const tamperedZip = await JSZip.loadAsync(await blob.arrayBuffer());
    const studioPath = "template-source/studio.json";
    const studio = JSON.parse(
      await tamperedZip.file(studioPath)!.async("string"),
    );
    studio.templateSource = '{{block "main"}}tampered{{/block}}';
    tamperedZip.file(studioPath, JSON.stringify(studio));
    const tamperedBlob = await tamperedZip.generateAsync({ type: "blob" });
    const tampered = await importThemePackage(
      new File([tamperedBlob], "tampered.zip"),
    );
    expect(tampered.projectData).toBeUndefined();
    expect(tampered.customTemplate).toContain("generated element");
    expect(tampered.warnings.join(" ")).toMatch(/模板来源与 b19\.art 不一致/);
  });

  it("rejects zip traversal names", async () => {
    const zip = new JSZip();
    zip.file("../info.yaml", "id: unsafe\nname: Unsafe");
    const blob = await zip.generateAsync({ type: "blob" });
    await expect(
      importThemePackage(new File([blob], "unsafe.zip")),
    ).rejects.toThrow(/不安全路径/);
  });

  it("rejects files outside the detected theme root", async () => {
    const zip = new JSZip();
    zip.file("safe/info.yaml", "id: safe\nname: Safe");
    zip.file("outside/image.png", new Uint8Array([1]));
    const blob = await zip.generateAsync({ type: "blob" });
    await expect(
      importThemePackage(new File([blob], "mixed-root.zip")),
    ).rejects.toThrow(/不在主题根目录/);
  });

  it("keeps passive documentation files without executing or parsing them", async () => {
    const zip = new JSZip();
    zip.file("documented/info.yaml", "id: documented\nname: Documented");
    zip.file("documented/README.md", "# Usage");
    zip.file("documented/SOURCE.txt", "Attribution");
    zip.file("documented/manual.pdf", new Uint8Array([37, 80, 68, 70]));
    zip.file("documented/license.docx", new Uint8Array([80, 75, 3, 4]));
    const blob = await zip.generateAsync({ type: "blob" });

    const imported = await importThemePackage(
      new File([blob], "documented.zip"),
    );
    expect(imported.assets.map((asset) => [asset.path, asset.mime])).toEqual([
      ["README.md", "text/markdown"],
      ["SOURCE.txt", "text/plain"],
      ["manual.pdf", "application/pdf"],
      [
        "license.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    ]);
    for (const importedAsset of imported.assets)
      URL.revokeObjectURL(importedAsset.previewUrl);
  });

  it("ignores unsupported files and reports them as import warnings", async () => {
    const zip = new JSZip();
    zip.file("supported/info.yaml", "id: supported\nname: Supported");
    zip.file("supported/source.psd", new Uint8Array([1, 2, 3]));
    zip.file("__MACOSX/.DS_Store", new Uint8Array([4, 5, 6]));
    const blob = await zip.generateAsync({ type: "blob" });

    const imported = await importThemePackage(
      new File([blob], "unsupported-files.zip"),
    );

    expect(imported.draft.id).toBe("supported");
    expect(imported.assets).toEqual([]);
    expect(imported.warnings.join(" ")).toMatch(/source\.psd/);
    expect(imported.warnings.join(" ")).toMatch(/\.DS_Store/);
  });

  it("ignores studio projects with scripts and falls back to package CSS", async () => {
    const zip = new JSZip();
    zip.file("safe/info.yaml", "id: safe\nname: Safe\ncss: b19.css");
    zip.file("safe/b19.css", '@import "../../b19.css";\n.song { color: red; }');
    zip.file(
      "safe/studio.json",
      JSON.stringify({
        schemaVersion: 1,
        generator: "phi-theme-studio",
        css: ".song { color: red; }",
        projectData: {
          pages: [
            {
              frames: [{ component: { type: "wrapper", script: "alert(1)" } }],
            },
          ],
        },
      }),
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const imported = await importThemePackage(
      new File([blob], "unsafe-studio.zip"),
    );
    expect(imported.projectData).toBeUndefined();
    expect(imported.css).toContain("color: red");
    expect(imported.warnings.join(" ")).toMatch(/禁止字段/);
  });

  it("rejects declared files that exceed the uncompressed budget", async () => {
    const zip = new JSZip();
    zip.file("large/info.yaml", "id: large\nname: Large");
    zip.file("large/large.png", new Uint8Array(20 * 1024 * 1024 + 1));
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
    });
    await expect(
      importThemePackage(new File([blob], "large.zip")),
    ).rejects.toThrow(/解压后超过限制/);
  });

  it("normalizes page targets and gives exact CSS keys precedence over short fallbacks", () => {
    expect(normalizeRenderTarget("setting")).toBe("setting/setting");
    expect(normalizeRenderTarget("setting/userSetting")).toBe(
      "setting/userSetting",
    );
    expect(
      resolvePageCss(
        { setting: ".short {}", "setting/userSetting": ".exact {}" },
        "setting/userSetting",
      ),
    ).toMatchObject({ css: ".exact {}", metadata: { match: "exact", key: "setting/userSetting" } });
    expect(resolvePageCss({ setting: ".short {}" }, "setting/userSetting")).toMatchObject({
      css: ".short {}",
      metadata: { match: "fallback", key: "setting" },
    });
  });

  it("exports and imports a v2 package with exact and short page CSS keys", async () => {
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "multi-page" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song { color: red; }",
      cssByPage: {
        sign: ".sign { color: blue; }",
        "setting/userSetting": ".setting-user { color: green; }",
      },
      pages: {
        "b19/b19": { css: ".song { color: red; }", projectData },
        sign: { css: ".sign { color: blue; }" },
        "setting/userSetting": { css: ".setting-user { color: green; }" },
      },
      customTemplate: "",
      projectData,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = YAML.parse(
      await zip.file("multi-page/info.yaml")!.async("string"),
    );
    expect(manifest.css).toEqual({
      "b19/b19": "b19.css",
      sign: "sign.css",
      "setting/userSetting": "setting-userSetting.css",
    });
    const studio = JSON.parse(
      await zip.file("multi-page/studio.json")!.async("string"),
    );
    expect(studio.schemaVersion).toBe(2);
    expect(studio.pages["setting/userSetting"].css).toContain("green");

    const imported = await importThemePackage(
      new File([blob], "multi-page.zip", { type: "application/zip" }),
    );
    expect(imported.css).toContain("color: red");
    expect(imported.cssByPage.sign).toContain("color: blue");
    expect(imported.cssByPage["setting/userSetting"]).toContain("color: green");
    expect(imported.pages?.["setting/userSetting"]?.css).toContain("color: green");
    expect(imported.pageCssMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "setting/userSetting", match: "exact" }),
        expect.objectContaining({ key: "sign", match: "fallback" }),
      ]),
    );
    for (const asset of imported.assets) URL.revokeObjectURL(asset.previewUrl);
  });

  it("does not copy each fixed page fixture into studio.json", async () => {
    const targets = [
      "b19/b19",
      "sign/sign",
      "update/update",
      "help/help",
      "table/table",
      "history/history",
      "difficulty/difficulty",
      "clg/clg",
      "arcgros/arcgros",
    ];
    const largeFixture = "fixed-fixture-copy-".repeat(35_000);
    const pages = Object.fromEntries(targets.map((target, index) => {
      const className = `phi-custom-text-size-${index}`;
      return [target, {
        css: `.${className} { left: ${index}px; color: #fff; }`,
        projectData: {
          pages: [{
            frames: [{
              component: {
                type: "wrapper",
                components: [
                  {
                    tagName: "main",
                    attributes: { "data-fixed-fixture": largeFixture },
                  },
                  {
                    tagName: "div",
                    type: "text",
                    classes: [className],
                    attributes: {
                      class: className,
                      "data-phi-selector": `.${className}`,
                      "data-phi-custom": "text",
                    },
                    content: `少量编辑 ${index}`,
                  },
                ],
              },
            }],
          }],
          styles: [{ selectors: [className], style: { left: `${index}px` } }],
        },
      }];
    }));
    const legacyShape = JSON.stringify({
      projectData: pages["b19/b19"].projectData,
      pages,
    });
    expect(new TextEncoder().encode(legacyShape).byteLength).toBeGreaterThan(
      5 * 1024 * 1024,
    );

    const { templateForProject } = await import("../editor/customElements");
    const b19Project = pages["b19/b19"].projectData;
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "compact-pages" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: pages["b19/b19"].css,
      pages,
      customTemplate: templateForProject("", b19Project),
      projectData: b19Project,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const studioText = await zip
      .file("compact-pages/studio.json")!
      .async("string");
    const studio = JSON.parse(studioText);

    expect(new TextEncoder().encode(studioText).byteLength).toBeLessThan(100_000);
    expect(studioText).not.toContain("data-fixed-fixture");
    expect(studio.projectData).toBeUndefined();
    for (const target of targets) {
      expect(collectCustomNodes(studio.pages[target].projectData)).toHaveLength(1);
      expect(studio.pages[target].css).toContain("color: #fff");
    }

    const imported = await importThemePackage(
      new File([blob], "compact-pages.zip", { type: "application/zip" }),
    );
    expect(Object.keys(imported.pages || {})).toHaveLength(targets.length);
    expect(collectCustomNodes(imported.pages!["b19/b19"].projectData!)[0]).toMatchObject({
      content: "少量编辑 0",
    });
    expect(imported.pages!["history/history"].css).toContain("color: #fff");
  });

  it("still imports legacy v2 files containing full fixture projects", async () => {
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "legacy-full-project" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song { color: red; }",
      pages: { "b19/b19": { css: ".song { color: red; }", projectData } },
      customTemplate: "",
      projectData,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const studioPath = "legacy-full-project/studio.json";
    const studio = JSON.parse(await zip.file(studioPath)!.async("string"));
    const legacyProject = {
      pages: [{
        frames: [{
          component: {
            type: "wrapper",
            components: [{ tagName: "main", content: "legacy fixed fixture" }],
          },
        }],
      }],
      styles: [{ selectors: ["song"], style: { color: "red" } }],
    };
    studio.projectData = legacyProject;
    studio.pages["b19/b19"].projectData = legacyProject;
    zip.file(studioPath, JSON.stringify(studio));
    const legacyBlob = await zip.generateAsync({ type: "blob" });

    const imported = await importThemePackage(
      new File([legacyBlob], "legacy-full-project.zip", { type: "application/zip" }),
    );
    expect(imported.warnings.join(" ")).not.toContain("studio.json 无法安全解析");
    expect(JSON.stringify(imported.projectData)).toContain("legacy fixed fixture");
  });

  it("keeps asset URLs working when a page stylesheet lives below the theme root", async () => {
    const asset: PackageAsset = {
      path: "assets/elements/panel.png",
      mime: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
      previewUrl: "blob:panel",
    };
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "nested-page-css" },
      resources: DEFAULT_RESOURCES,
      assets: [asset],
      css: "",
      cssByPage: {
        sign: '.panel { background-image: url("blob:panel"); }',
      },
      cssPaths: { sign: "pages/sign.css" },
      customTemplate: "",
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const packaged = await zip.file("nested-page-css/pages/sign.css")!.async("string");
    expect(packaged).toContain('url("../assets/elements/panel.png")');

    const imported = await importThemePackage(
      new File([blob], "nested-page-css.zip", { type: "application/zip" }),
    );
    expect(imported.cssByPage.sign).toContain('url("assets/elements/panel.png")');
    for (const importedAsset of imported.assets) URL.revokeObjectURL(importedAsset.previewUrl);
  });

  it("normalizes a short page state onto an exact CSS key", async () => {
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "canonical-page-state" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: "",
      cssByPage: { "sign/sign": ".exact { color: red; }" },
      pages: { sign: { css: ".state { color: blue; }" } },
      customTemplate: "",
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = YAML.parse(
      await zip.file("canonical-page-state/info.yaml")!.async("string"),
    );
    expect(manifest.css).toMatchObject({ "sign/sign": "sign-sign.css" });

    const imported = await importThemePackage(
      new File([blob], "canonical-page-state.zip", { type: "application/zip" }),
    );
    expect(imported.warnings.join(" ")).not.toContain("studio.json 无法安全解析");
    expect(imported.pages?.["sign/sign"]?.css).toContain("color: blue");
  });

  it("keeps B19 base imports correct for nested stylesheet paths", async () => {
    const input = {
      draft: { ...DEFAULT_DRAFT, id: "nested-b19" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song { color: red; }",
      cssByPage: { "b19/b19": ".song { color: red; }" },
      pages: { "b19/b19": { css: ".song { color: red; }" } },
      cssPaths: { "b19/b19": "pages/b19.css" },
      customTemplate: "",
    };
    const overrideBlob = await exportThemePackage(input);
    const overrideZip = await JSZip.loadAsync(await overrideBlob.arrayBuffer());
    const overrideCss = await overrideZip
      .file("nested-b19/pages/b19.css")!
      .async("string");
    expect(overrideCss).toMatch(/^@import "\.\.\/\.\.\/\.\.\/b19\.css";/);

    const standaloneBlob = await exportThemePackage({
      ...input,
      draft: { ...input.draft, id: "nested-b19-standalone" },
      exportMode: "standalone",
    });
    const standaloneZip = await JSZip.loadAsync(await standaloneBlob.arrayBuffer());
    const standaloneCss = await standaloneZip
      .file("nested-b19-standalone/pages/b19.css")!
      .async("string");
    expect(standaloneCss).toMatch(
      /^@import "\.\.\/\.\.\/\.\.\/\.\.\/common\/common\.css";/,
    );
  });

  it("does not collapse two template states into one short app CSS key", async () => {
    const blob = await exportThemePackage({
      draft: { ...DEFAULT_DRAFT, id: "exact-page-states" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: "",
      cssByPage: { setting: ".setting { color: red; }" },
      pages: {
        "setting/setting": { css: ".setting { color: red; }" },
        "setting/userSetting": { css: ".user-setting { color: blue; }" },
      },
      customTemplate: "",
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = YAML.parse(await zip.file("exact-page-states/info.yaml")!.async("string"));
    expect(manifest.css).toMatchObject({
      "setting/setting": "setting-setting.css",
      "setting/userSetting": "setting-userSetting.css",
    });
    expect(manifest.css.setting).toBeUndefined();
  });

  it("rejects unsafe or colliding page stylesheet paths", () => {
    const unsafe = validateTheme({
      draft: { ...DEFAULT_DRAFT, id: "unsafe-page-css" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song {}",
      cssByPage: { sign: ".sign {}" },
      cssPaths: { sign: "../outside.css" },
      customTemplate: "",
    });
    expect(unsafe.some((issue) => issue.level === "error" && issue.message.includes("路径不安全"))).toBe(true);
    const duplicate = validateTheme({
      draft: { ...DEFAULT_DRAFT, id: "duplicate-page-css" },
      resources: DEFAULT_RESOURCES,
      assets: [],
      css: ".song {}",
      cssByPage: { sign: ".sign {}", update: ".update {}" },
      cssPaths: { sign: "shared.css", update: "shared.css" },
      customTemplate: "",
    });
    expect(duplicate.some((issue) => issue.level === "error" && issue.message.includes("路径重复"))).toBe(true);
  });
});
