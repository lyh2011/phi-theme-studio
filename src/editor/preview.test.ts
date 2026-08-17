// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT, DEFAULT_RESOURCES } from "../types/theme";
import {
  applyPreviewPage,
  applyRuntimePreview,
  applySharedRuntimePreview,
  applyUserSettingVariant,
  DEFAULT_PREVIEW_OPTIONS,
  DEFAULT_USER_SETTING_VARIANT,
  fitPreviewText,
  formatPreviewSuggestion,
  PREVIEW_MARKUP,
  PROTECTED_CSS,
  USER_SETTING_VARIANTS,
  USER_SETTING_VARIANT_HEIGHTS,
  type PreviewOptions,
} from "./preview";

function renderPreview() {
  document.body.innerHTML = PREVIEW_MARKUP;
  return document;
}

const hidden = (element: Element | null) =>
  element?.hasAttribute("data-phi-preview-hidden") ?? true;

const EXPECTED_SCORE_RECORDS = [
  "P1|BANGING STRIKE|IN|15.9|15.90|phi|1000000|100.00%|无法推分|",
  "P2|蝎虎天体 -Lacertid-|IN|15.5|15.50|phi|1000000|100.00%|无法推分|",
  "P3|星拂云锦 feat. koi|IN|15.5|15.50|phi|1000000|100.00%|无法推分|",
  "#1|DESTRUCTION 3,2,1|AT|17.3|16.79|S|957285|99.33%|99.37%|2",
  "#2|Stasis|AT|16.7|16.55|V|981768|99.80%|99.84%|4",
  "#3|祈 -我ら神祖と共に歩む者なり-|AT|17.3|16.48|S|930644|98.92%|98.96%|1",
  "#4|Re：End of a Dream|AT|16.9|16.40|V|974630|99.33%|99.37%|2",
  "#5|Distorted Fate|AT|17.4|16.39|S|946871|98.67%|98.71%|1",
  "#6|Lyrith -迷宮リリス-|AT|16.5|16.38|FC|998471|99.83%|99.87%|5",
  "#7|AbsoluTe disoRdeR|AT|17.2|16.34|S|933837|98.86%|98.90%|1",
  "#8|BANGING STRIKE|AT|16.8|16.31|V|970373|99.33%|99.37%|2",
  "#9|ATHAZA|AT|16.6|16.28|V|972675|99.57%|99.61%|3",
  "#10|祈 -我ら神祖と共に歩む者なり-|IN|16.4|16.20|V|975806|99.73%|99.77%|4",
  "#11|Ad astra per aspera|IN|16.3|16.15|V|964742|99.79%|99.83%|4",
  "#12|幻影鬼魅 (PLEASE)|AT|17.0|16.13|S|943956|98.84%|98.88%|1",
  "#13|Spasmodic|AT|16.7|16.13|S|939237|99.23%|99.27%|2",
  "#14|彩|IN|16.4|16.12|V|979760|99.62%|99.66%|3",
  "#15|PRAGMATISM -RESURRECTION-|AT|16.6|16.12|V|990826|99.34%|99.38%|2",
  "#16|夢の降る日に|IN|16.6|16.11|S|953536|99.34%|99.38%|2",
  "#17|Fractured Angel|IN|16.3|16.11|FC|997675|99.74%|99.78%|4",
  "#18|Distorted Fate|IN|16.3|16.11|FC|997609|99.73%|99.78%|4",
  "#19|Avataar ~Reincarnation of Kalpa~|AT|16.6|16.08|V|977803|99.29%|99.33%|2",
  "#20|70 Minutes Fighters|IN|16.5|16.08|S|943552|99.43%|99.47%|2",
  "#21|Cthugha|AT|16.1|16.05|FC|999346|99.93%|99.97%|5",
  "#22|Bounded Quietude|IN|16.2|16.03|FC|996571|99.76%|99.80%|4",
  "#23|NO x|IN|16.1|15.99|FC|998630|99.85%|99.89%|5",
  "#24|Incyde|IN|16.2|15.99|V|972357|99.71%|99.75%|4",
  "#25|Rrhar'il|IN|16.1|15.98|FC|998546|99.84%|99.88%|5",
  "#26|AbsoluTe disoRdeR|IN|16.3|15.91|V|978284|99.46%|99.50%|3",
  "#27|零號車輛|IN|16.2|15.90|V|977649|99.58%|99.63%|3",
  "#28|BANGING STRIKE|IN|15.9|15.90|phi|1000000|100.00%|无法推分|",
  "#29|明鏡烈火|IN|15.9|15.87|FC|999645|99.96%|无法推分|",
  "#30|+ERABY+E CONNEC+10N|IN|16.3|15.87|S|958941|99.40%|99.49%|2",
  "#31|PRAGMATISM -RESURRECTION-|IN|16.0|15.85|FC|997793|99.79%|99.91%|5",
  "#32|DESTRUCTION 3,2,1|IN|16.3|15.85|V|965633|99.37%|99.49%|2",
  "#33|QZKago Requiem|AT|17.4|15.84|A|916947|97.94%|98.06%|0",
] as const;

describe("preview formatting", () => {
  it("matches phi-plugin's two-decimal suggestion output", () => {
    expect(formatPreviewSuggestion("99.3745%")).toBe("99.37%");
    expect(formatPreviewSuggestion("99.8379%")).toBe("99.84%");
    expect(formatPreviewSuggestion("无法推分")).toBe("无法推分");
  });

  it("keeps the editor-only text fitting stylesheet out of the markup", () => {
    expect(PREVIEW_MARKUP).not.toContain("phi-preview-text-fit");
  });

  it("emits a reduced size for an overflowing score-card title", () => {
    document.body.innerHTML = `
      <div class="song" data-phi-role="song-card" data-phi-slot="best" data-phi-index="1">
        <div class="songname"><p name="pvis">A deliberately long title</p></div>
      </div>`;
    const title = document.querySelector<HTMLElement>(".songname p")!;
    const parent = title.parentElement!;
    title.style.fontSize = "15px";
    Object.defineProperty(parent, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(parent, "offsetHeight", { configurable: true, value: 20 });
    Object.defineProperty(title, "scrollWidth", {
      configurable: true,
      get: () => Number.parseFloat(title.style.fontSize || "15") * 10,
    });
    Object.defineProperty(title, "scrollHeight", { configurable: true, value: 15 });

    fitPreviewText(document);

    expect(document.querySelector<HTMLStyleElement>("#phi-preview-text-fit")?.textContent)
      .toContain("font-size: 10px");
    expect(title.style.fontSize).toBe("15px");
  });
});

describe("canonical score fixture", () => {
  it("keeps all 36 exported score fields bound to the same record", () => {
    const preview = renderPreview();
    const cards = [
      ...preview.querySelectorAll<HTMLElement>(
        '[data-phi-role="song-card"]',
      ),
    ];

    expect(cards).toHaveLength(36);
    const actual = cards.map((card) => {
      const rankElement = card.querySelector<HTMLElement>(
        '[class^="rank-"]',
      );
      const [rank = "", difficulty = ""] =
        rankElement
          ?.querySelector(".org p")
          ?.textContent?.trim()
          .split(/\s+/) ?? [];
      const suggestion = card.querySelector<HTMLElement>(".suggest");
      const suggestionKind =
        suggestion?.className.match(/suggest-kind-(\d+)/)?.[1] ?? "";

      return [
        card.querySelector(".num p")?.textContent,
        card.querySelector(".songname p")?.textContent,
        rank,
        difficulty,
        card.querySelector(".rel p")?.textContent,
        card.querySelector(".Rating img")?.getAttribute("data-rating"),
        card.querySelector(".score p")?.textContent,
        card.querySelector(".acc p")?.textContent,
        suggestion?.querySelector("p")?.textContent,
        suggestionKind,
      ].join("|");
    });

    expect(actual).toEqual(EXPECTED_SCORE_RECORDS);
  });

  it("shows the exact score-card set for every preview mode", () => {
    const preview = renderPreview();
    const expectedNumbers = {
      b19: ["P1", "P2", "P3", ...Array.from({ length: 16 }, (_, i) => `#${i + 1}`)],
      b27: Array.from({ length: 27 }, (_, i) => `#${i + 1}`),
      b30: ["P1", "P2", "P3", ...Array.from({ length: 27 }, (_, i) => `#${i + 1}`)],
      b33: ["P1", "P2", "P3", ...Array.from({ length: 33 }, (_, i) => `#${i + 1}`)],
      analysis: ["P1", "P2", "P3", ...Array.from({ length: 27 }, (_, i) => `#${i + 1}`)],
    } as const;

    for (const [page, expected] of Object.entries(expectedNumbers)) {
      applyPreviewPage(
        preview,
        page as keyof typeof expectedNumbers,
        DEFAULT_PREVIEW_OPTIONS,
      );
      const visibleNumbers = [
        ...preview.querySelectorAll<HTMLElement>(
          '[data-phi-role="song-card"]',
        ),
      ]
        .filter((card) => !hidden(card))
        .map((card) => card.querySelector(".num p")?.textContent);

      expect(visibleNumbers).toEqual(expected);
    }
  });
});

describe("difficulty color preview", () => {
  it("derives the complete RKS histogram from the P1-P3 and B1-B27 records", () => {
    // The canvas must carry phi-plugin's real base rules, not just preview extras.
    expect(PROTECTED_CSS).toContain(".b30-analysis-row");
    expect(PROTECTED_CSS).toContain(".Nosignal");
    expect(PROTECTED_CSS).not.toContain("@import");
    expect(PROTECTED_CSS).toContain("/font/phi.ttf");
    expect(PREVIEW_MARKUP).toContain('class="average-marker"');
    expect(PREVIEW_MARKUP).not.toMatch(/\sstyle=/);

    const preview = renderPreview();
    expect(Array.from(preview.querySelectorAll(".histogram-grid-line p"), (node) => node.textContent))
      .toEqual(["15.00", "15.50", "16.00", "16.50", "17.00"]);
    expect(Array.from(preview.querySelectorAll<HTMLElement>(".histogram-slot"), (slot) => [
      slot.querySelector(".histogram-slot-label")?.textContent,
      Number(slot.dataset.rks),
    ])).toEqual([
      ["P1", 15.9], ["P2", 15.5], ["P3", 15.5],
      ...[16.79, 16.55, 16.48, 16.4, 16.39, 16.38, 16.34, 16.31, 16.28,
        16.2, 16.15, 16.13, 16.13, 16.12, 16.12, 16.11, 16.11, 16.11, 16.08,
        16.08, 16.05, 16.03, 15.99, 15.99, 15.98, 15.91, 15.9]
        .map((rks, index) => [`B${index + 1}`, rks]),
    ]);
    expect(preview.querySelector(".histogram-summary p:last-child")?.textContent)
      .toBe("16.1337");
    expect(preview.querySelector(".average-marker p")?.textContent)
      .toBe("AVG 16.1337");

    const marker = PROTECTED_CSS.match(
      /:where\(\.average-marker\) \{ bottom: ([\d.]+)%; \}/,
    );
    expect(Number(marker?.[1])).toBeCloseTo(56.6833333333, 9);
    const heights = Array.from(
      PROTECTED_CSS.matchAll(
        /:where\(\.histogram-slot:nth-child\(\d+\) \.histogram-bar\) \{ height: ([\d.]+)%; \}/g,
      ),
      (match) => Number(match[1]),
    );
    expect(heights).toHaveLength(30);
    expect(heights).toEqual([
      45.000000000000014, 25, 25, 89.49999999999996, 77.50000000000003,
      74.00000000000003, 69.99999999999993, 69.50000000000003,
      68.99999999999994, 67, 65.49999999999994, 64.00000000000006,
      59.999999999999964, 57.49999999999993, 56.49999999999995,
      56.49999999999995, 56.00000000000005, 56.00000000000005,
      55.49999999999997, 55.49999999999997, 55.49999999999997,
      53.999999999999915, 53.999999999999915, 52.500000000000036,
      51.50000000000006, 49.500000000000014, 49.500000000000014,
      49.00000000000002, 45.50000000000001, 45.000000000000014,
    ]);
  });

  it("uses difficulty variables for rank and info elements", () => {
    for (const key of ["AT", "IN", "HD", "EZ"] as const) {
      expect(PROTECTED_CSS).toContain(
        `.rank-${key} { background-color: var(--${key}); }`,
      );
      expect(PROTECTED_CSS).toContain(
        `background-color: color-mix(in srgb, var(--${key}) 30%, transparent);`,
      );
      expect(PROTECTED_CSS).toContain(`border-color: var(--${key});`);
    }
  });

  it("updates runtime variables when the theme form draft changes", () => {
    const draft = {
      ...DEFAULT_DRAFT,
      colors: { ...DEFAULT_DRAFT.colors, IN: "#12ab34" },
    };

    applyRuntimePreview(document, draft, DEFAULT_RESOURCES, []);
    expect(document.querySelector("#phi-runtime-theme")?.textContent).toContain(
      "--IN: #12ab34",
    );

    applyRuntimePreview(
      document,
      {
        ...draft,
        colors: { ...draft.colors, IN: "#abcdef" },
      },
      DEFAULT_RESOURCES,
      [],
    );
    const runtimeCss =
      document.querySelector("#phi-runtime-theme")?.textContent || "";
    expect(runtimeCss).toContain("html:root");
    expect(runtimeCss).toContain("--IN: #abcdef");
    expect(runtimeCss).not.toContain("--IN: #12ab34");
    expect(runtimeCss).toContain("--phi-theme-IN: #abcdef");
    expect(runtimeCss).toContain("--phi-theme-IN-dark: color-mix");
  });

  it("restores bundled rating icons after a custom icon is removed", () => {
    const preview = renderPreview();
    const icon = preview.querySelector<HTMLImageElement>('img[data-rating="phi"]');
    expect(icon).not.toBeNull();

    applyRuntimePreview(
      preview,
      DEFAULT_DRAFT,
      { ...DEFAULT_RESOURCES, icons: { phi: "assets/phi.png" } },
      [{ path: "assets/phi.png", mime: "image/png", bytes: new Uint8Array([1]), previewUrl: "blob:phi" }],
    );
    expect(icon?.src).toBe("blob:phi");

    applyRuntimePreview(preview, DEFAULT_DRAFT, DEFAULT_RESOURCES, []);
    expect(icon?.src).toMatch(/demo\/rating\/phi\.png$/);
  });

  it("restores a standalone page's own background when no upload is active", () => {
    document.body.innerHTML = `
      <div class="background">
        <img src="/demo/milthm-bg.png" alt="">
      </div>`;
    const image = document.querySelector<HTMLImageElement>(".background img");

    applySharedRuntimePreview(
      document,
      DEFAULT_DRAFT,
      { ...DEFAULT_RESOURCES, background: "assets/custom.png" },
      [{
        path: "assets/custom.png",
        mime: "image/png",
        bytes: new Uint8Array([1]),
        previewUrl: "blob:custom-background",
      }],
    );
    expect(image?.getAttribute("src")).toBe("blob:custom-background");

    applySharedRuntimePreview(
      document,
      DEFAULT_DRAFT,
      { ...DEFAULT_RESOURCES, background: undefined },
      [],
    );

    expect(image?.getAttribute("src")).toBe("/demo/milthm-bg.png");
    expect(image?.dataset.phiDefaultSrc).toBe("/demo/milthm-bg.png");
  });

  it("lets an uploaded theme font override preview component fonts", () => {
    const resources = { ...DEFAULT_RESOURCES, font: "assets/theme.ttf" };
    const assets = [
      {
        path: "assets/theme.ttf",
        mime: "font/ttf",
        bytes: new Uint8Array([0]),
        previewUrl: "blob:theme-font",
      },
    ];

    applyRuntimePreview(document, DEFAULT_DRAFT, resources, assets);
    const runtimeCss =
      document.querySelector("#phi-runtime-theme")?.textContent || "";
    expect(runtimeCss).toContain(
      '@font-face { font-family: "phi-theme-preview"',
    );
    expect(runtimeCss).toContain(
      'body, body * { font-family: "phi-theme-preview"',
    );
    expect(runtimeCss).toContain("!important");
  });
});

describe("conditional runtime elements", () => {
  const options = (
    overrides: Partial<PreviewOptions> = {},
  ): PreviewOptions => ({
    ...DEFAULT_PREVIEW_OPTIONS,
    ...overrides,
  });

  it("ships every phi-plugin conditional block with a stable runtime selector", () => {
    for (const selector of [
      ".spInfoBox",
      ".accAvg",
      ".accAvgLine",
      ".cpToOld",
      ".Nosignal",
      ".tag-analysis-tip",
      ".tag-insufficient-message",
    ]) {
      expect(PREVIEW_MARKUP).toContain(`data-phi-selector="${selector}"`);
    }
    expect(PREVIEW_MARKUP).toContain(
      'class="spInfo colorful-background clip-box"',
    );
    expect(PREVIEW_MARKUP).toContain("border_corner_right_bottom");
    expect(PREVIEW_MARKUP).not.toMatch(/\sstyle=/);
  });

  it("honours the option toggles independently of the page filter", () => {
    const preview = renderPreview();

    applyPreviewPage(preview, "analysis", options());
    expect(hidden(preview.querySelector(".spInfoBox"))).toBe(false);
    expect(hidden(preview.querySelector(".accAvg"))).toBe(false);
    expect(hidden(preview.querySelector(".cpToOld"))).toBe(true);
    expect(hidden(preview.querySelector(".Nosignal"))).toBe(true);

    applyPreviewPage(
      preview,
      "analysis",
      options({ spInfo: false, cpToOld: true }),
    );
    expect(hidden(preview.querySelector(".spInfoBox"))).toBe(true);
    expect(hidden(preview.querySelector(".cpToOld"))).toBe(false);
  });

  it("swaps the third Phi card for the no-signal placeholder", () => {
    const preview = renderPreview();
    const phiCard = () =>
      preview.querySelector('.song[data-phi-slot="phi"][data-phi-index="3"]');

    applyPreviewPage(preview, "b19", options());
    expect(hidden(phiCard())).toBe(false);
    expect(hidden(preview.querySelector(".Nosignal"))).toBe(true);

    applyPreviewPage(preview, "b19", options({ nosignal: true }));
    expect(hidden(phiCard())).toBe(true);
    expect(hidden(preview.querySelector(".Nosignal"))).toBe(false);

    // B27 has no Phi slots at all, so the placeholder follows the same rule.
    applyPreviewPage(preview, "b27", options({ nosignal: true }));
    expect(hidden(preview.querySelector(".Nosignal"))).toBe(true);
  });

  it("mirrors the runtime state classes of the analysis panels", () => {
    const preview = renderPreview();
    const row = preview.querySelector(".b30-analysis-row");
    const body = preview.querySelector(".tag-analysis-body");

    applyPreviewPage(preview, "analysis", options());
    expect(row?.classList.contains("histogram-wide")).toBe(false);
    expect(body?.classList.contains("is-insufficient")).toBe(false);
    expect(hidden(preview.querySelector(".tag-analysis-tip"))).toBe(false);
    expect(hidden(preview.querySelector(".tag-insufficient-message"))).toBe(
      true,
    );

    applyPreviewPage(
      preview,
      "analysis",
      options({ tagInsufficient: true, histogramWide: true }),
    );
    expect(row?.classList.contains("histogram-wide")).toBe(true);
    expect(body?.classList.contains("is-insufficient")).toBe(true);
    expect(hidden(preview.querySelector(".tag-analysis-panel"))).toBe(true);
    expect(hidden(preview.querySelector(".tag-analysis-tip"))).toBe(true);
  });

  it("leaves nested conditional blocks unreachable while their page section is hidden", () => {
    const preview = renderPreview();

    applyPreviewPage(preview, "b19", options({ tagInsufficient: true }));
    expect(hidden(preview.querySelector(".b30-analysis-row"))).toBe(true);
    expect(
      preview
        .querySelector(".tag-insufficient-message")
        ?.closest("[data-phi-preview-hidden]"),
    ).toBe(preview.querySelector(".b30-analysis-row"));
  });
});

describe("user-setting variants", () => {
  it("keeps personal settings as the default and toggles one shared target", () => {
    document.body.innerHTML = `
      <div data-phi-setting-variant="personal" class="personal-title"></div>
      <div data-phi-setting-variant="personal" class="personal-group"></div>
      <div data-phi-setting-variant="api" class="api-title"></div>
      <div data-phi-setting-variant="api" class="api-group"></div>`;

    expect(DEFAULT_USER_SETTING_VARIANT).toBe("personal");
    expect(USER_SETTING_VARIANTS.map(({ id }) => id)).toEqual(["personal", "api"]);
    expect(USER_SETTING_VARIANT_HEIGHTS.personal).toBe(1465);
    expect(USER_SETTING_VARIANT_HEIGHTS.api).toBe(1320);
    applyUserSettingVariant(document);
    expect(document.documentElement.dataset.phiUserSettingVariant).toBe("personal");
    expect(document.querySelector(".personal-title")?.hasAttribute("data-phi-preview-hidden")).toBe(false);
    expect(document.querySelector(".api-title")?.hasAttribute("data-phi-preview-hidden")).toBe(true);

    applyUserSettingVariant(document, "api");
    expect(document.documentElement.dataset.phiUserSettingVariant).toBe("api");
    expect(document.querySelector(".personal-group")?.hasAttribute("data-phi-preview-hidden")).toBe(true);
    expect(document.querySelector(".api-group")?.hasAttribute("data-phi-preview-hidden")).toBe(false);
  });
});
