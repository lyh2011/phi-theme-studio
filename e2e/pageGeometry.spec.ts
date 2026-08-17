import { expect, test, type Frame, type Page } from "@playwright/test";

interface PageCase {
  tab: string;
  subTab?: string;
  readySelector: string;
  contentSelector: string;
  width: number;
  height: number;
  minBottomRatio: number;
  minSpanRatio: number;
}

const PAGE_CASES: PageCase[] = [
  { tab: "B19 成绩图", subTab: "B30数据分析", readySelector: ".b30-analysis-row", contentSelector: ".song:not([data-phi-preview-hidden]), .b30-analysis-row", width: 1200, height: 1960, minBottomRatio: 0.9, minSpanRatio: 0.7 },
  { tab: "每日签到", readySelector: ".dashboard", contentSelector: ".backGlass, .playerInfo, .leftRail, .dailySongsPanel, .noticePanel, .createdbox", width: 2048, height: 1080, minBottomRatio: 0.9, minSpanRatio: 0.78 },
  { tab: "存档更新", readySelector: ".record_box", contentSelector: ".title, .record_box, .Nosignal, .createdbox", width: 800, height: 931, minBottomRatio: 0.88, minSpanRatio: 0.75 },
  { tab: "课题模式", readySelector: ".song-box", contentSelector: ".box", width: 1920, height: 1200, minBottomRatio: 0.78, minSpanRatio: 0.65 },
  { tab: "Arcaea 风格 B19", readySelector: ".song_box", contentSelector: ".box", width: 1200, height: 1520, minBottomRatio: 0.9, minSpanRatio: 0.82 },
  { tab: "推分建议", readySelector: ".group", contentSelector: ".group_list, .createdbox", width: 1200, height: 1206, minBottomRatio: 0.9, minSpanRatio: 0.78 },
  { tab: "定数表", readySelector: ".tableBox > .content", contentSelector: ".tableBox", width: 960, height: 2294, minBottomRatio: 0.86, minSpanRatio: 0.8 },
  { tab: "成绩列表", readySelector: ".list_box > .line", contentSelector: ".head_title, .list_box, .createdbox", width: 800, height: 440, minBottomRatio: 0.74, minSpanRatio: 0.62 },
  { tab: "B30 历史", readySelector: ".main-box > .row", contentSelector: ".title, .descTip, .main-box, .createdbox", width: 800, height: 6547, minBottomRatio: 0.97, minSpanRatio: 0.96 },
  { tab: "个人信息", readySelector: ".stats-box", contentSelector: ".left, .right", width: 1920, height: 1500, minBottomRatio: 0.9, minSpanRatio: 0.84 },
  { tab: "插件设置", readySelector: ".box > .lineBox", contentSelector: ".box", width: 800, height: 2200, minBottomRatio: 0.82, minSpanRatio: 0.75 },
  { tab: "用户设置", readySelector: ".setting-b30AvgKind", contentSelector: ".panel, .createdbox", width: 1080, height: 1465, minBottomRatio: 0.99, minSpanRatio: 0.95 },
  { tab: "定数历史", readySelector: ".a-box[data-rank]", contentSelector: ".header, .difficulty", width: 2048, height: 1031, minBottomRatio: 0.72, minSpanRatio: 0.62 },
  { tab: "帮助", readySelector: ".help_box", contentSelector: ".help_box, .createdbox", width: 1200, height: 4237, minBottomRatio: 0.94, minSpanRatio: 0.9 },
];

const B19_PREVIEW_CASES = [
  { tab: "B19", id: "b19", cards: 19, height: 1220 },
  { tab: "B27", id: "b27", cards: 27, height: 1460 },
  { tab: "B30", id: "b30", cards: 30, height: 1590 },
  { tab: "B33", id: "b33", cards: 36, height: 1900 },
  { tab: "B30数据分析", id: "analysis", cards: 30, height: 1960 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("phi-theme-studio:guide-seen:v1", "1");
    indexedDB.deleteDatabase("keyval-store");
  });
});

test("all page fixtures render complete content inside their canvases", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/");
  const frame = await findEditorFrame(page);

  for (const fixture of PAGE_CASES) {
    await selectFixture(page, frame, fixture);
    await waitForImages(frame);

    const loadCommonFonts = fixture.tab !== "B19 成绩图";
    const metrics = await frame.evaluate(async ({ contentSelector, loadCommonFonts }) => {
      const fonts = [];
      if (loadCommonFonts) {
        for (const family of ["PHI", "Aldrich"]) {
          const requested = await document.fonts.load(`16px "${family}"`, "Phi-Plugin 123");
          const registered = Array.from(document.fonts)
            .filter((face) => face.family.replace(/^["']|["']$/g, "") === family);
          fonts.push({
            family,
            requested: requested.length,
            statuses: registered.map((face) => face.status),
          });
        }
      }
      await document.fonts.ready;
      const visible = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && !element.closest("[data-phi-preview-hidden]");
      };
      const bodyRect = document.body.getBoundingClientRect();
      const width = bodyRect.width;
      const height = bodyRect.height;
      const content = Array.from(document.querySelectorAll(contentSelector)).filter(visible);
      const contentRects = content.map((element) => element.getBoundingClientRect());
      const bounds = contentRects.length
        ? {
            top: Math.min(...contentRects.map((rect) => rect.top)),
            right: Math.max(...contentRects.map((rect) => rect.right)),
            bottom: Math.max(...contentRects.map((rect) => rect.bottom)),
            left: Math.min(...contentRects.map((rect) => rect.left)),
          }
        : undefined;
      const overflow = Array.from(document.querySelectorAll("[data-phi-selector]"))
        .filter(visible)
        .filter((element) => !element.matches(".background img"))
        .map((element) => ({
          selector: element.getAttribute("data-phi-selector"),
          rect: element.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.left < -12 || rect.top < -12 || rect.right > width + 12 || rect.bottom > height + 12)
        .map(({ selector, rect }) => ({
          selector,
          rect: { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top },
        }));

      return {
        body: { height, width },
        bounds,
        brokenImages: Array.from(document.images)
          .filter((image) => image.complete && image.naturalWidth === 0)
          .map((image) => image.alt || image.src),
        contentCount: content.length,
        fonts,
        overflow,
        scroll: {
          // GrapesJS appends its rule/script containers to <html>; those editor
          // nodes can extend the document without belonging to the fixture.
          height: document.body.scrollHeight,
          width: document.body.scrollWidth,
        },
        viewport: { height: window.innerHeight, width: window.innerWidth },
      };
    }, { contentSelector: fixture.contentSelector, loadCommonFonts });

    expect.soft(metrics.brokenImages, `${fixture.tab}: broken images`).toEqual([]);
    expect.soft(metrics.body.width, `${fixture.tab}: canvas width`).toBeCloseTo(fixture.width, 0);
    expect.soft(metrics.body.height, `${fixture.tab}: canvas height`).toBeCloseTo(fixture.height, 0);
    expect.soft(metrics.contentCount, `${fixture.tab}: content roots`).toBeGreaterThan(0);
    if (loadCommonFonts) {
      expect.soft(metrics.fonts, `${fixture.tab}: bundled fonts`).toEqual([
        { family: "PHI", requested: 1, statuses: ["loaded"] },
        { family: "Aldrich", requested: 1, statuses: ["loaded"] },
      ]);
    }
    expect.soft(metrics.bounds, `${fixture.tab}: content bounds`).toBeDefined();
    expect.soft(metrics.scroll.width, `${fixture.tab}: horizontal scroll`).toBeLessThanOrEqual(
      metrics.body.width + 2,
    );
    expect.soft(metrics.scroll.height, `${fixture.tab}: vertical scroll`).toBeLessThanOrEqual(
      Math.max(metrics.body.height, metrics.viewport.height) + 2,
    );
    if (metrics.bounds) {
      expect.soft(metrics.bounds.left, `${fixture.tab}: content left`).toBeGreaterThanOrEqual(-2);
      expect.soft(metrics.bounds.right, `${fixture.tab}: content right`).toBeLessThanOrEqual(metrics.body.width + 2);
      expect.soft(metrics.bounds.bottom, `${fixture.tab}: content bottom overflow`).toBeLessThanOrEqual(metrics.body.height + 2);
      expect.soft(metrics.bounds.bottom / metrics.body.height, `${fixture.tab}: trailing blank area`).toBeGreaterThanOrEqual(fixture.minBottomRatio);
      expect.soft((metrics.bounds.bottom - metrics.bounds.top) / metrics.body.height, `${fixture.tab}: content span`).toBeGreaterThanOrEqual(fixture.minSpanRatio);
    }
    expect.soft(metrics.overflow, `${fixture.tab}: semantic elements outside canvas`).toEqual([]);
    await expect(page.locator(".topbar-status")).toHaveAttribute("title", "已自动保存");
  }

  expect(browserErrors, "browser errors").toEqual([]);
});

test("player info keeps the reference panel, chart, tick, and stat-card geometry", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "个人信息" }).click();
  await frame.locator(".stats-box").waitFor({ state: "visible" });
  await waitForImages(frame);

  const metrics = await frame.evaluate(() => {
    const rect = (element: Element | Range) => {
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    const textRect = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return rect(range);
    };
    return {
      body: rect(document.body),
      cards: Array.from(document.querySelectorAll<HTMLElement>(".one-stats-box"), (card) => ({
        rank: card.dataset.rank,
        rect: rect(card),
      })),
      charts: Array.from(document.querySelectorAll(".svg-box"), (chart) => rect(chart)),
      challenge: (() => {
        const element = document.querySelector<HTMLElement>("#Challenge2")!;
        const style = getComputedStyle(element);
        return {
          rect: rect(element),
          style: {
            fontSize: style.fontSize,
            height: style.height,
            right: style.right,
            spanLineHeight: getComputedStyle(element.querySelector("span")!).lineHeight,
            top: style.top,
            width: style.width,
          },
          text: textRect(element.querySelector("span")!),
        };
      })(),
      images: Array.from(document.images, (image) => ({
        height: image.naturalHeight,
        src: image.getAttribute("src"),
        width: image.naturalWidth,
      })),
      left: rect(document.querySelector(".left")!),
      ranges: Array.from(document.querySelectorAll(".value_box"), (range) =>
        Array.from(range.querySelectorAll("p"), (node) => node.textContent?.trim())),
      right: rect(document.querySelector(".right")!),
      segments: Array.from(document.querySelectorAll(".svg-box"), (chart) =>
        chart.querySelectorAll(".line > svg > line").length),
      ticks: Array.from(document.querySelectorAll(".acc-range p"), (tick) => ({
        rect: textRect(tick),
        text: tick.textContent?.trim(),
      })),
    };
  });

  expect(metrics.body).toMatchObject({ height: 1500, width: 1920 });
  expect(metrics.left.top).toBeLessThan(100);
  expect(metrics.right.top).toBeLessThan(100);
  expect(metrics.left.bottom).toBeGreaterThan(1400);
  expect(metrics.right.bottom).toBeGreaterThan(1400);
  expect(metrics.left.right).toBeLessThan(metrics.right.left);
  expect(metrics.right.left - metrics.left.right).toBeGreaterThan(40);
  expect(metrics.challenge.style).toMatchObject({
    fontSize: "60px",
    height: "75px",
    spanLineHeight: "normal",
    top: "40px",
    width: "150px",
  });
  expect(metrics.challenge.text.height).toBeGreaterThan(55);
  expect(metrics.challenge.text.left).toBeGreaterThan(metrics.challenge.rect.left + 30);
  expect(metrics.challenge.text.right).toBeLessThan(metrics.challenge.rect.right - 30);

  expect(metrics.charts).toHaveLength(3);
  expect(metrics.segments).toEqual([60, 18, 40]);
  expect(metrics.ranges).toEqual([
    ["16.1340", "15.1275"],
    ["422018", "123074"],
    ["16.1340", "14.0163", "11.8987", "9.7810", "7.6633"],
  ]);
  for (let index = 0; index < metrics.charts.length - 1; index += 1) {
    expect(metrics.charts[index].bottom).toBeLessThan(metrics.charts[index + 1].top);
    expect(metrics.charts[index].left).toBeCloseTo(metrics.charts[index + 1].left, 0);
  }

  expect(metrics.ticks.map(({ text }) => text)).toEqual([
    "98.67%", "98.84%", "99.23%", "99.37%", "99.57%", "99.71%", "99.85%", "100%",
  ]);
  for (let index = 0; index < metrics.ticks.length - 1; index += 1) {
    expect(metrics.ticks[index].rect.right).toBeLessThan(metrics.ticks[index + 1].rect.left);
  }

  expect(metrics.cards.map(({ rank }) => rank)).toEqual(["EZ", "HD", "IN", "AT"]);
  expect(metrics.cards[0].rect.left).toBeCloseTo(metrics.cards[2].rect.left, 0);
  expect(metrics.cards[1].rect.left).toBeCloseTo(metrics.cards[3].rect.left, 0);
  expect(metrics.cards[0].rect.top).toBeLessThan(metrics.cards[2].rect.top);
  expect(metrics.cards[1].rect.top).toBeLessThan(metrics.cards[3].rect.top);
  expect(metrics.images.every(({ height, width }) => height > 0 && width > 0)).toBe(true);
  expect(metrics.images.find(({ src }) => src?.endsWith("challenge-3.png"))).toMatchObject({
    height: 190,
    width: 386,
  });
});

test("switching to long pages refits after applying the current canvas dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1200 });
  await page.goto("/");
  const frame = await findEditorFrame(page);
  const fixtures = [
    { tab: "定数表", readySelector: ".tableBox > .content", height: 2294, width: 960 },
    { tab: "B30 历史", readySelector: ".main-box > .row", height: 6547, width: 800 },
    { tab: "帮助", readySelector: ".help_box", height: 4237, width: 1200 },
  ] as const;

  for (const fixture of fixtures) {
    await page.getByRole("tab", { exact: true, name: fixture.tab }).click();
    await frame.locator(fixture.readySelector).first().waitFor({ state: "visible" });

    await expect.poll(async () => page.evaluate(({ height, width }) => {
      const stage = document.querySelector<HTMLElement>(".canvas-stage")!.getBoundingClientRect();
      const canvas = document.querySelector<HTMLElement>(".gjs-cv-canvas")!;
      const editorFrame = document.querySelector<HTMLIFrameElement>(".gjs-frame")!;
      const frameRect = editorFrame.getBoundingClientRect();
      const frameStyle = getComputedStyle(editorFrame);
      return {
        canvasHeight: canvas.clientHeight,
        canvasScrollHeight: canvas.scrollHeight,
        expectedDevice: frameStyle.width === `${width}px` && frameStyle.height === `${height}px`,
        insideStage: frameRect.top >= stage.top && frameRect.bottom <= stage.bottom + 1,
      };
    }, fixture)).toEqual({
      canvasHeight: 1026,
      canvasScrollHeight: 1026,
      expectedDevice: true,
      insideStage: true,
    });
  }
});

test("sign-in progress and streak styling survives the editor import", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "每日签到" }).click();
  await frame.locator(".edgeProgress").waitFor({ state: "visible" });

  const metrics = await frame.evaluate(() => ({
    fills: ["EZ", "HD", "IN", "AT"].map((rank) => {
      const track = document.querySelector(`.edgeFill--${rank}`)!;
      return ["unlock", "fc", "phi"].map((kind) => {
        const fill = track.querySelector(`.edgeFill--${kind}`)!;
        const rect = fill.getBoundingClientRect();
        const style = getComputedStyle(fill);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          height: rect.height,
          width: rect.width,
        };
      });
    }),
    streak: (() => {
      const element = document.querySelector(".spInfo")!;
      const rect = element.getBoundingClientRect();
      return {
        background: getComputedStyle(element).backgroundImage,
        height: rect.height,
        text: element.textContent?.trim(),
        width: rect.width,
      };
    })(),
    longSong: (() => {
      const element = document.querySelector<HTMLElement>(".songName-fit-reference")!;
      const context = document.createElement("canvas").getContext("2d")!;
      const style = getComputedStyle(element);
      context.font = style.font;
      return {
        clientWidth: element.clientWidth,
        fontSize: style.fontSize,
        prefixThroughKn: context.measureText("Freaky Undulations ~Noble Kn…").width,
        prefixThroughKni: context.measureText("Freaky Undulations ~Noble Kni…").width,
        scrollWidth: element.scrollWidth,
      };
    })(),
  }));

  expect(metrics.fills.map((fills) => fills.map(({ height }) => height))).toEqual([
    [460.796875, 19.1875, 6.390625],
    [422.390625, 25.59375, 0],
    [435.1875, 83.1875, 25.59375],
    [582.390625, 44.796875, 12.796875],
  ]);
  expect(metrics.fills.flat().every(({ width }) => width > 0)).toBe(true);
  expect(metrics.fills.flat().every(({ backgroundColor, backgroundImage }) => (
    backgroundImage !== "none" || backgroundColor !== "rgba(0, 0, 0, 0)"
  ))).toBe(true);
  expect(metrics.streak).toMatchObject({ text: "累计签到 5 天" });
  expect(metrics.streak.width).toBeGreaterThan(0);
  expect(metrics.streak.height).toBeGreaterThan(0);
  expect(metrics.streak.background).toContain("linear-gradient");
  expect(metrics.longSong.fontSize).toBe("29.75px");
  expect(metrics.longSong.scrollWidth).toBeGreaterThan(metrics.longSong.clientWidth);
  expect(metrics.longSong.prefixThroughKn).toBeLessThanOrEqual(metrics.longSong.clientWidth);
  expect(metrics.longSong.prefixThroughKni).toBeGreaterThan(metrics.longSong.clientWidth);
});

test("help and update retain the upstream horizontal geometry inside the editor wrapper", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);

  await page.getByRole("tab", { exact: true, name: "帮助" }).click();
  await frame.locator(".help_box").first().waitFor({ state: "visible" });
  const help = await frame.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, width: value.width };
    };
    return {
      groups: Array.from(document.querySelectorAll(".help_box"), rect),
      firstRow: Array.from(document.querySelectorAll(".help_box:first-of-type > .line"), rect),
    };
  });
  expect(help.groups.every(({ left, width }) => (
    Math.abs(left - 60) < 0.5 && Math.abs(width - 1080) < 0.5
  ))).toBe(true);
  expect(help.firstRow).toEqual([
    { left: 60, width: 360 },
    { left: 420, width: 360 },
    { left: 780, width: 360 },
  ]);

  await page.getByRole("tab", { exact: true, name: "存档更新" }).click();
  await frame.locator(".record_box").waitFor({ state: "visible" });
  const update = await frame.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, width: value.width };
    };
    const firstSongBox = document.querySelector(".song_box")!;
    const chartSvg = document.querySelector<SVGSVGElement>(".rks_line .line > svg")!;
    const chartSegments = Array.from(chartSvg.querySelectorAll<SVGLineElement>(":scope > line"));
    const coordinates = (segment: SVGLineElement) =>
      ["x1", "y1", "x2", "y2"].map((attribute) => segment.getAttribute(attribute));
    const textFits = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .every((element) => element.scrollWidth <= element.clientWidth + 1
          && element.scrollHeight <= element.clientHeight + 1);
    return {
      cards: Array.from(firstSongBox.querySelectorAll(":scope > .abox"), rect),
      chart: {
        dates: Array.from(document.querySelectorAll(".date_box p"), (node) => node.textContent?.trim()),
        first: coordinates(chartSegments[0]),
        last: coordinates(chartSegments.at(-1)!),
        positiveLengthSegments: chartSegments.filter((segment) => segment.getTotalLength() > 0).length,
        range: Array.from(document.querySelectorAll(".value_box p"), (node) => node.textContent?.trim()),
        rollback: coordinates(chartSegments[8]),
        segmentCount: chartSegments.length,
        transform: getComputedStyle(chartSvg).transform,
        zeroLengthSegments: chartSegments.filter((segment) => segment.getTotalLength() === 0).length,
      },
      chartDatesFit: textFits(".date_box p"),
      graph: rect(document.querySelector(".svg-box")!),
      historyLabelsFit: textFits(".history-title .box_title-left p"),
      player: rect(document.querySelector(".title .r")!),
      record: rect(document.querySelector(".record_box")!),
      rightLabelsFit: textFits(".box_title-right p"),
      taskTitle: rect(document.querySelector(".fixture-task-title")!),
    };
  });
  expect(update.player).toEqual({ left: 20, width: 320 });
  expect(update.graph).toEqual({ left: 380, width: 400 });
  expect(update.record).toEqual({ left: 8, width: 784 });
  expect(update.taskTitle).toEqual({ left: 18, width: 755 });
  expect(update.cards).toEqual([
    { left: 18, width: 135 },
    { left: 175, width: 135 },
    { left: 332, width: 135 },
    { left: 489, width: 135 },
    { left: 646, width: 135 },
  ]);
  expect(update.chart).toEqual({
    dates: ["2025/12/19 20:44:48", "2026/08/16 12:07:50"],
    first: ["0%", "0%", "0.006083022344984508%", "0%"],
    last: ["99.56934710823985%", "100%", "100%", "100%"],
    positiveLengthSegments: 56,
    range: ["16.1340", "15.1275"],
    rollback: [
      "35.50058521224073%",
      "69.16473451968895%",
      "38.70847022103195%",
      "66.1840326173572%",
    ],
    segmentCount: 60,
    transform: "matrix(1, 0, 0, -1, 0, 0)",
    zeroLengthSegments: 4,
  });
  expect(update.chartDatesFit).toBe(true);
  expect(update.historyLabelsFit).toBe(true);
  expect(update.rightLabelsFit).toBe(true);
});

test("list fixture forms a non-overlapping three-by-three grid", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "成绩列表" }).click();
  await frame.locator(".list_box > .line").first().waitFor({ state: "visible" });
  await waitForImages(frame);

  const rects = await frame.locator(".list_box > .line").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    }),
  );
  const clustered = (values: number[]) => {
    const clusters: number[] = [];
    for (const value of values.sort((left, right) => left - right)) {
      if (!clusters.some((candidate) => Math.abs(candidate - value) < 2)) clusters.push(value);
    }
    return clusters;
  };

  expect(rects).toHaveLength(9);
  expect(clustered(rects.map((rect) => rect.left))).toHaveLength(3);
  expect(clustered(rects.map((rect) => rect.top))).toHaveLength(3);
  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      const overlapWidth = Math.min(rects[left].right, rects[right].right) - Math.max(rects[left].left, rects[right].left);
      const overlapHeight = Math.min(rects[left].bottom, rects[right].bottom) - Math.max(rects[left].top, rects[right].top);
      expect(Math.max(0, overlapWidth) * Math.max(0, overlapHeight), `list cards ${left + 1}/${right + 1} overlap`).toBe(0);
    }
  }

  const bindings = await frame.locator(".list_box > .line").evaluateAll((cards) => cards.map((card) => {
    const element = card as HTMLElement;
    const song = card.querySelector<HTMLElement>(".song")!;
    const songText = song.querySelector<HTMLElement>(":scope > span")!;
    const artwork = card.querySelector<HTMLImageElement>(".ill_box img")!;
    return {
      artworkId: artwork.alt,
      artworkTitle: artwork.title,
      decoded: artwork.complete && artwork.naturalWidth > 0 && artwork.naturalHeight > 0,
      fits: songText.scrollWidth <= song.clientWidth + 0.5
        && songText.scrollHeight <= song.clientHeight + 0.5,
      songId: element.dataset.songId,
      title: song.textContent?.trim(),
    };
  }));
  expect(bindings.every(({ artworkId, songId }) => artworkId === songId)).toBe(true);
  expect(bindings.every(({ artworkTitle, title }) => artworkTitle === title)).toBe(true);
  expect(bindings.every(({ decoded }) => decoded)).toBe(true);
  expect(bindings.every(({ fits }) => fits)).toBe(true);
});

test("B30 history keeps all 107 mapped changes on the 800 by 6547 reference canvas", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "B30 历史" }).click();
  await frame.locator(".main-box > .row").first().waitFor({ state: "visible" });
  await waitForImages(frame);

  const metrics = await frame.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".main-box > .row"));
    const changes = Array.from(document.querySelectorAll<HTMLElement>(".s-song"));
    const artworks = changes.map((change) => change.querySelector<HTMLImageElement>(".ill > img")!);
    return {
      body: rect(document.body),
      brokenImages: Array.from(document.images)
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.src),
      changeCounts: {
        enter: changes.filter((change) => change.dataset.change === "enter").length,
        exit: changes.filter((change) => change.dataset.change === "exit").length,
        total: changes.length,
      },
      firstChange: {
        artwork: artworks[0].getAttribute("src"),
        difficulty: changes[0].dataset.difficulty,
        songId: changes[0].dataset.songId,
      },
      firstUnderline: rect(document.querySelector(".underLine")!),
      footer: rect(document.querySelector(".createdbox")!),
      historyIndexes: changes.map((change) => change.dataset.historyIndex),
      invalidArtworkMappings: changes.flatMap((change, index) => {
        const artwork = artworks[index];
        const pathname = new URL(artwork.src).pathname;
        return (
          artwork.alt === change.dataset.songId
          && artwork.dataset.songId === change.dataset.songId
          && pathname.startsWith("/demo/song-covers/")
        ) ? [] : [{
          alt: artwork.alt,
          cardSongId: change.dataset.songId,
          imageSongId: artwork.dataset.songId,
          pathname,
        }];
      }),
      lastChange: {
        artwork: artworks.at(-1)?.getAttribute("src"),
        difficulty: changes.at(-1)?.dataset.difficulty,
        songId: changes.at(-1)?.dataset.songId,
      },
      rowCounts: rows.map((row) => row.querySelectorAll(":scope > .songs-box > .s-song").length),
      rowDates: rows.map((row) => row.dataset.date),
      rowTops: rows.map((row) => rect(row).top),
      uniqueArtworkSources: new Set(artworks.map((artwork) => new URL(artwork.src).pathname)).size,
    };
  });

  expect(metrics.body).toMatchObject({ height: 6547, width: 800 });
  expect(metrics.brokenImages).toEqual([]);
  expect(metrics.changeCounts).toEqual({ enter: 68, exit: 39, total: 107 });
  expect(metrics.rowCounts).toEqual([2, 2, 2, 2, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 8, 28, 4, 2, 4, 29]);
  expect(metrics.rowDates).toHaveLength(21);
  expect(metrics.rowDates[0]).toBe("2026/08/14 15:28:02");
  expect(metrics.rowDates.at(-1)).toBe("2025/12/19 20:44:48");
  expect(metrics.historyIndexes).toEqual(Array.from({ length: 107 }, (_, index) => String(index + 1)));
  expect(metrics.uniqueArtworkSources).toBe(47);
  expect(metrics.invalidArtworkMappings).toEqual([]);
  expect(metrics.firstChange).toEqual({
    artwork: "/demo/song-covers/low-AbsoluTedisoRdeR_AcuteDisarray-354a18d309.webp",
    difficulty: "AT",
    songId: "AbsoluTedisoRdeR.AcuteDisarray",
  });
  expect(metrics.lastChange).toEqual({
    artwork: "/demo/song-covers/low-ATHAZA_LeaF-bf57c995d9.webp",
    difficulty: "IN",
    songId: "ATHAZA.LeaF",
  });
  expect(metrics.firstUnderline.top).toBeCloseTo(182.5, 0);
  expect(metrics.footer.top).toBeCloseTo(6475, 0);
  expect(metrics.footer.bottom).toBeLessThanOrEqual(metrics.body.bottom);
  for (let index = 1; index < metrics.rowTops.length; index += 1) {
    expect(metrics.rowTops[index]).toBeGreaterThan(metrics.rowTops[index - 1]);
  }
});

test("Arcaea B30 keeps the reference 33 score cards visible and non-overlapping", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "Arcaea 风格 B19" }).click();
  await frame.locator(".box > .song_box").first().waitFor({ state: "visible" });
  await waitForImages(frame);

  await expectCompleteCardLayout(frame, ".box > .song_box", 33, "Arcaea B30", true);
  await expect(frame.locator(".player_id p")).toHaveText("lyh");
  await expect(frame.locator(".rks_num p")).toHaveText("16.13");
  await expect(frame.locator(".arcChallenge p")).toHaveText("48");
  expect(await frame.locator(".box > .song_box").evaluateAll((cards) => cards.map((card) => ({
    difficulty: card.querySelector(".difficulty p")?.textContent?.trim(),
    number: card.querySelector(".num p")?.textContent?.trim(),
    ratingScore: card.querySelector(".rks p")?.textContent?.trim(),
    title: card.querySelector(".name p")?.textContent?.trim(),
  })))).toMatchObject([
    { difficulty: "15.9", number: "P1", ratingScore: "15.90", title: "BANGING STRIKE" },
    { difficulty: "15.5", number: "P2", ratingScore: "15.50", title: "蝎虎天体 -Lacertid-" },
    { difficulty: "15.5", number: "P3", ratingScore: "15.50", title: "星拂云锦 feat. koi" },
    { difficulty: "17.3", number: "#1", ratingScore: "16.79", title: "DESTRUCTION 3,2,1" },
    ...Array.from({ length: 28 }, () => ({})),
    { difficulty: "16.3", number: "#30", ratingScore: "15.87", title: "+ERABY+E CONNEC+10N" },
  ]);
  const cardGrid = await frame.locator(".box > .song_box").evaluateAll((cards) => {
    const cluster = (values: number[]) => {
      const result: number[] = [];
      for (const value of values.sort((left, right) => left - right)) {
        if (!result.some((candidate) => Math.abs(candidate - value) < 2)) result.push(value);
      }
      return result;
    };
    const rects = cards.map((card) => card.getBoundingClientRect());
    const rows = cluster(rects.map((rect) => rect.top));
    const halfPixel = (value: number) => Math.round(value * 2) / 2;
    const player = document.querySelector(".player")!.getBoundingClientRect();
    const footer = document.querySelector(".arc_created")!.getBoundingClientRect();
    const body = document.body.getBoundingClientRect();
    return {
      background: document.querySelector<HTMLImageElement>(".background > img")!.getAttribute("src"),
      playerBackground: document.querySelector<HTMLImageElement>(".player_broad > img")!.getAttribute("src"),
      artworkMismatch: cards.flatMap((card) => {
        const title = card.querySelector(".name p")?.textContent?.trim();
        const artwork = card.querySelector<HTMLImageElement>(".ill_box > img");
        return artwork?.alt === title ? [] : [{ alt: artwork?.alt, title }];
      }),
      distortedArtwork: cards.flatMap((card) => {
        const frame = card.querySelector<HTMLElement>(".ill_box")!;
        const artwork = frame.querySelector<HTMLImageElement>(":scope > img")!;
        const rect = artwork.getBoundingClientRect();
        const renderedRatio = rect.width / rect.height;
        const naturalRatio = artwork.naturalWidth / artwork.naturalHeight;
        return Math.abs(renderedRatio - naturalRatio) < 0.01 && rect.width > frame.clientWidth
          ? []
          : [{ key: card.getAttribute("data-card-key"), naturalRatio, renderedRatio }];
      }),
      columns: cluster(rects.map((rect) => rect.left)).map(halfPixel),
      dimensions: [...new Set(rects.map((rect) => `${rect.width}x${rect.height}`))],
      footer: { left: footer.left, top: footer.top },
      player: {
        centerOffset: (player.left + player.right - body.left - body.right) / 2,
        top: player.top,
      },
      rowCounts: rows.map((top) => rects.filter((rect) => Math.abs(rect.top - top) < 2).length),
      rows: rows.map(halfPixel),
      titleOverflow: cards.flatMap((card) => {
        const title = card.querySelector<HTMLElement>(".name p")!;
        const box = title.parentElement!;
        return title.scrollWidth <= box.clientWidth && title.scrollHeight <= box.clientHeight
          ? []
          : [card.getAttribute("data-card-key")];
      }),
      uniqueArtworkSources: new Set(cards.map((card) => (
        card.querySelector<HTMLImageElement>(".ill_box > img")!.src
      ))).size,
    };
  });
  expect(cardGrid.artworkMismatch).toEqual([]);
  expect(cardGrid.background).toBe("/demo/arcgros-background.png");
  expect(cardGrid.playerBackground).toBe("/demo/background.png");
  expect(cardGrid.columns).toEqual([42.5, 265.5, 488.5, 711.5, 934.5]);
  expect(cardGrid.dimensions).toEqual(["216x169"]);
  expect(cardGrid.distortedArtwork).toEqual([]);
  expect(cardGrid.footer.left).toBeCloseTo(49, 1);
  expect(cardGrid.footer.top).toBeCloseTo(1496, 1);
  expect(cardGrid.player.centerOffset).toBeCloseTo(0, 1);
  expect(cardGrid.player.top).toBeCloseTo(130, 1);
  expect(cardGrid.rowCounts).toEqual([5, 5, 5, 5, 5, 5, 3]);
  expect(cardGrid.rows).toEqual([221, 403, 585, 767, 949, 1131, 1313]);
  expect(cardGrid.titleOverflow).toEqual([]);
  expect(cardGrid.uniqueArtworkSources).toBe(28);
});

test("every B19 preview view keeps its exact cards and decoded artwork inside the canvas", async ({ page }) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "B19 成绩图" }).click();
  await expect(page.getByRole("tab", { exact: true, name: "B19 成绩图" }))
    .toHaveAttribute("aria-selected", "true");

  const cardSelector = ".song:not([data-phi-preview-hidden])";
  for (const view of B19_PREVIEW_CASES) {
    await page.getByRole("tab", { exact: true, name: view.tab }).click();
    await expect(page.getByRole("tab", { exact: true, name: view.tab }))
      .toHaveAttribute("aria-selected", "true");
    await expect(frame.locator("html")).toHaveAttribute("data-phi-preview", view.id);
    await expect(frame.locator(cardSelector), `${view.tab}: visible card count`)
      .toHaveCount(view.cards);
    await expect.poll(
      () => frame.locator("body").evaluate((body) => Math.round(body.getBoundingClientRect().height)),
      { message: `${view.tab}: canvas height settles` },
    ).toBe(view.height);
    await waitForImages(frame);

    const canvas = await frame.locator("body").evaluate((body) => {
      const rect = body.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });
    expect(canvas.width, `${view.tab}: canvas width`).toBeCloseTo(1200, 0);
    expect(canvas.height, `${view.tab}: canvas height`).toBeCloseTo(view.height, 0);
    await expectCompleteCardLayout(frame, cardSelector, view.cards, view.tab, true);

    const bestCount = view.id === "b19" ? 16 : view.id === "b33" ? 33 : 27;
    const expectedCards = [
      ...(view.id === "b27"
        ? []
        : Array.from({ length: 3 }, (_, index) => ({
            index: String(index + 1),
            number: `P${index + 1}`,
            slot: "phi",
          }))),
      ...Array.from({ length: bestCount }, (_, index) => ({
        index: String(index + 1),
        number: `#${index + 1}`,
        slot: "best",
      })),
    ];
    const actualCards = await frame.locator(cardSelector).evaluateAll((cards) =>
      cards.map((card) => ({
        index: (card as HTMLElement).dataset.phiIndex,
        number: card.querySelector(".num p")?.textContent?.trim(),
        slot: (card as HTMLElement).dataset.phiSlot,
      })),
    );
    expect(actualCards, `${view.tab}: slot and number sequence`).toEqual(expectedCards);

    const noSignal = frame.locator(".Nosignal");
    await expect(noSignal, `${view.tab}: missing-Phi placeholder stays hidden`).toBeHidden();
    const thirdPhi = frame.locator('.song[data-phi-slot="phi"][data-phi-index="3"]');
    if (view.id === "b27") {
      await expect(thirdPhi, `${view.tab}: Phi slots stay hidden`).toBeHidden();
    } else {
      await expect(thirdPhi, `${view.tab}: third Phi record remains visible`).toBeVisible();
    }

    const overflow = frame.locator("[data-phi-overflow]");
    if (view.id === "b33") {
      await expect(overflow, `${view.tab}: overflow heading`).toBeVisible();
      expect(await overflow.evaluate((heading) => ({
        next: heading.nextElementSibling?.querySelector(".num p")?.textContent?.trim(),
        previous: heading.previousElementSibling?.querySelector(".num p")?.textContent?.trim(),
      })), `${view.tab}: overflow position`).toEqual({ next: "#28", previous: "#27" });
    } else {
      await expect(overflow, `${view.tab}: overflow heading stays hidden`).toBeHidden();
    }

    const analysis = frame.locator(".b30-analysis-row");
    if (view.id === "analysis") {
      await expect(analysis, `${view.tab}: analysis section`).toBeVisible();
      await expect(analysis.locator(".histogram-slot"), `${view.tab}: histogram slots`).toHaveCount(30);
      await expect(analysis.locator(".phi-bar"), `${view.tab}: Phi histogram bars`).toHaveCount(3);
      await expect(analysis.locator(".best-bar"), `${view.tab}: Best histogram bars`).toHaveCount(27);
      const histogram = await analysis.evaluate((root) => {
        const ratio = (element: Element, parent: Element) => (
          element.getBoundingClientRect().height / parent.getBoundingClientRect().height * 100
        );
        const scale = root.querySelector<HTMLElement>(".histogram-scale")!;
        const marker = root.querySelector<HTMLElement>(".average-marker")!;
        return {
          average: root.querySelector(".histogram-summary p:last-child")?.textContent?.trim(),
          marker: Number.parseFloat(getComputedStyle(marker).bottom) / scale.clientHeight * 100,
          rks: Array.from(root.querySelectorAll<HTMLElement>(".histogram-slot"), (slot) => Number(slot.dataset.rks)),
          slots: Array.from(root.querySelectorAll<HTMLElement>(".histogram-slot"), (slot) => ({
            height: ratio(slot.querySelector(".histogram-bar")!, slot.querySelector(".histogram-bar-area")!),
            label: slot.querySelector(".histogram-slot-label")?.textContent?.trim(),
          })),
          ticks: Array.from(root.querySelectorAll<HTMLElement>(".histogram-grid-line"), (tick) => ({
            label: tick.textContent?.trim(),
            position: Number.parseFloat(getComputedStyle(tick).bottom) / scale.clientHeight * 100,
          })),
        };
      });
      const expectedRks = [
        15.9, 15.5, 15.5, 16.79, 16.55, 16.48, 16.4, 16.39, 16.38, 16.34,
        16.31, 16.28, 16.2, 16.15, 16.13, 16.13, 16.12, 16.12, 16.11, 16.11,
        16.11, 16.08, 16.08, 16.05, 16.03, 15.99, 15.99, 15.98, 15.91, 15.9,
      ];
      const expectedHeights = [
        45, 25, 25, 89.5, 77.5, 74, 70, 69.5, 69, 67, 65.5, 64, 60, 57.5,
        56.5, 56.5, 56, 56, 55.5, 55.5, 55.5, 54, 54, 52.5, 51.5, 49.5,
        49.5, 49, 45.5, 45,
      ];
      expect(histogram.average).toBe("16.1337");
      expect(histogram.rks).toEqual(expectedRks);
      expect(histogram.slots.map((slot) => slot.label)).toEqual([
        "P1", "P2", "P3", ...Array.from({ length: 27 }, (_, index) => `B${index + 1}`),
      ]);
      expect(histogram.ticks.map((tick) => tick.label)).toEqual([
        "15.00", "15.50", "16.00", "16.50", "17.00",
      ]);
      histogram.ticks.forEach((tick, index) => {
        expect(tick.position, `histogram tick ${index + 1}`).toBeCloseTo(index * 25, 1);
      });
      histogram.slots.forEach((slot, index) => {
        expect(slot.height, `histogram bar ${index + 1}`).toBeCloseTo(expectedHeights[index], 1);
      });
      expect(histogram.marker).toBeCloseTo(56.6833333333, 1);
      await expect(analysis.locator(".tag-radar-point"), `${view.tab}: radar points`).toHaveCount(5);
      await expect(analysis.locator(".tag-radar-label"), `${view.tab}: radar labels`).toHaveCount(5);
      await expect(analysis.locator(".strong-tags .tag-result-row"), `${view.tab}: strong tags`).toHaveCount(3);
      await expect(analysis.locator(".weak-tags .tag-result-row"), `${view.tab}: weak tags`).toHaveCount(3);
    } else {
      await expect(analysis, `${view.tab}: analysis section stays hidden`).toBeHidden();
    }

    const artwork = await frame.locator(`${cardSelector} .ill img`).evaluateAll((images) =>
      images.map((image) => {
        const element = image as HTMLImageElement;
        const card = element.closest('[data-phi-role="song-card"]')!;
        return {
          alt: element.alt,
          complete: element.complete,
          naturalHeight: element.naturalHeight,
          naturalWidth: element.naturalWidth,
          src: element.getAttribute("src"),
          title: card.querySelector(".songname p")?.textContent?.trim(),
        };
      }),
    );
    expect(artwork, `${view.tab}: artwork count`).toHaveLength(view.cards);
    expect(
      artwork.filter((image) => (
        !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || !image.src
      )),
      `${view.tab}: broken artwork`,
    ).toEqual([]);
    expect(
      artwork.filter((image) => image.alt !== image.title),
      `${view.tab}: artwork/title binding`,
    ).toEqual([]);

    const background = await frame.locator(".background img").evaluate((image) => {
      const element = image as HTMLImageElement;
      const imageRect = element.getBoundingClientRect();
      const bodyRect = document.body.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        covers: imageRect.left <= bodyRect.left + 0.5
          && imageRect.top <= bodyRect.top + 0.5
          && imageRect.right >= bodyRect.right - 0.5
          && imageRect.bottom >= bodyRect.bottom - 0.5,
        loaded: element.complete && element.naturalWidth > 0 && element.naturalHeight > 0,
        visible: style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity) > 0
          && imageRect.width > 0
          && imageRect.height > 0,
      };
    });
    expect(background, `${view.tab}: background image`).toEqual({
      covers: true,
      loaded: true,
      visible: true,
    });
  }

  expect(browserErrors, "B19 preview browser errors").toEqual([]);
});

test("suggestion page keeps all 18 records visible and non-overlapping", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "推分建议" }).click();
  await frame.locator(".group_list > .group .row_box > .line").first()
    .waitFor({ state: "visible" });
  await waitForImages(frame);

  await expectCompleteCardLayout(
    frame,
    ".group_list > .group .row_box > .line",
    18,
    "suggestion",
    true,
  );

  const bindings = await frame.locator(".group_list > .group .row_box > .line")
    .evaluateAll((cards) => cards.map((card) => {
      const song = card.querySelector<HTMLElement>(".song")!;
      const difficulty = card.querySelector<HTMLElement>(".dif")!;
      const artwork = card.querySelector<HTMLImageElement>(".ill_box img")!;
      const songRect = song.getBoundingClientRect();
      const difficultyRect = difficulty.getBoundingClientRect();
      return {
        artworkTitle: artwork.title,
        decoded: artwork.complete && artwork.naturalWidth > 0,
        difficultyLeft: difficultyRect.left,
        fits: song.querySelector<HTMLElement>(":scope > span")!.scrollWidth <= song.clientWidth + 0.5,
        songRight: songRect.right,
        title: song.textContent?.trim(),
      };
    }));

  expect(bindings.every(({ artworkTitle, title }) => artworkTitle === title)).toBe(true);
  expect(bindings.every(({ decoded }) => decoded)).toBe(true);
  expect(bindings.every(({ difficultyLeft, songRight }) => songRight <= difficultyLeft + 0.5)).toBe(true);
  expect(bindings.every(({ fits }) => fits)).toBe(true);
});

test("constant table exposes all ten difficulty sections and 58 cards", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "定数表" }).click();
  await frame.locator(".tableBox > .content > .song").first().waitFor({ state: "visible" });
  await waitForImages(frame);

  await expect(frame.locator(".tableBox > .label")).toHaveCount(10);
  await expect(frame.locator(".tableBox > .content")).toHaveCount(10);
  await expect(frame.locator(".phigrosVersion")).toHaveText("3.19.5");
  await expect(frame.locator(".queryDifficulty .index > p")).toHaveText("16");
  await expect(frame.locator(".queryDifficulty .total").first()).toHaveText("Total: 58");
  expect(await frame.locator(".tableBox > .content").evaluateAll((sections) => (
    sections.map((section) => section.querySelectorAll(":scope > .song").length)
  ))).toEqual([6, 8, 8, 8, 6, 7, 6, 4, 3, 2]);
  await expectCompleteCardLayout(
    frame,
    ".tableBox > .content > .song",
    58,
    "constant table",
    false,
  );
});

test("B30 history keeps the reference timeline colors and artwork bindings", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "B30 历史" }).click();
  await frame.locator(".main-box > .row").first().waitFor({ state: "visible" });
  await waitForImages(frame);
  await waitForCommonFonts(frame);

  const state = await frame.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { height: value.height, top: value.top };
    };
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      footer: rect(document.querySelector(".createdbox")!),
      rows: Array.from(document.querySelectorAll<HTMLElement>(".main-box > .row"), (row) => ({
        color: getComputedStyle(row).getPropertyValue("--row-color").trim(),
        inlineColor: row.style.getPropertyValue("--row-color"),
        lineColor: getComputedStyle(row.querySelector(".underLine")!).backgroundColor,
        rect: rect(row),
      })),
      songs: Array.from(document.querySelectorAll<HTMLElement>(".s-song"), (song) => {
        const artwork = song.querySelector<HTMLImageElement>(".ill > img")!;
        return {
          alt: artwork.alt,
          artworkSongId: artwork.dataset.songId,
          decoded: artwork.complete && artwork.naturalWidth > 0,
          songId: song.dataset.songId,
        };
      }),
    };
  });

  const colors = [
    "#2a4d2d", "#64110d", "#0c5c29", "#5b0462", "#5600bb", "#369c5b", "#307f46",
    "#a35584", "#c8096c", "#00959e", "#665c26", "#9ea38d", "#c7c41d", "#7bb219",
    "#ad2e1b", "#801ca2", "#566177", "#13989e", "#b70927", "#c892b8", "#c52263",
  ];
  const lineColors = [
    "rgb(42, 77, 45)", "rgb(100, 17, 13)", "rgb(12, 92, 41)", "rgb(91, 4, 98)",
    "rgb(86, 0, 187)", "rgb(54, 156, 91)", "rgb(48, 127, 70)", "rgb(163, 85, 132)",
    "rgb(200, 9, 108)", "rgb(0, 149, 158)", "rgb(102, 92, 38)", "rgb(158, 163, 141)",
    "rgb(199, 196, 29)", "rgb(123, 178, 25)", "rgb(173, 46, 27)", "rgb(128, 28, 162)",
    "rgb(86, 97, 119)", "rgb(19, 152, 158)", "rgb(183, 9, 39)", "rgb(200, 146, 184)",
    "rgb(197, 34, 99)",
  ];
  const rowTops = [
    120, 290, 460, 630, 800, 1087.5, 1257.5, 1427.5, 1597.5, 1767.5, 1937.5,
    2107.5, 2277.5, 2447.5, 2617.5, 2787.5, 3195, 4442.5, 4730, 4900, 5187.5,
  ];
  const rowHeights = [
    230, 230, 230, 230, 347.5, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230,
    467.5, 1307.5, 347.5, 230, 347.5, 1307.5,
  ];

  expect(state.bodyFont.split(",")[0].replaceAll('"', "")).toBe("PHI");
  expect(state.rows.map(({ color }) => color)).toEqual(colors);
  expect(state.rows.map(({ inlineColor }) => inlineColor)).toEqual(colors.map(() => ""));
  expect(state.rows.map(({ lineColor }) => lineColor)).toEqual(lineColors);
  for (const [index, row] of state.rows.entries()) {
    expect(row.rect.top, `history row ${index + 1}: top`).toBeCloseTo(rowTops[index], 0);
    expect(row.rect.height, `history row ${index + 1}: height`).toBeCloseTo(rowHeights[index], 0);
  }
  expect(state.footer.top).toBeCloseTo(6475, 0);
  expect(state.songs).toHaveLength(107);
  expect(state.songs.every(({ alt, artworkSongId, decoded, songId }) => (
    decoded && alt === songId && artworkSongId === songId
  ))).toBe(true);
});

test("difficulty history binds the real version fixture to the plugin chart formula", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "定数历史" }).click();
  await frame.locator("#difficultyChart .chart-line").first().waitFor({ state: "visible" });
  await waitForCommonFonts(frame);

  const chart = await frame.locator("#difficultyChart").evaluate((svg) => ({
    ariaLabel: svg.getAttribute("aria-label"),
    songId: (svg as SVGSVGElement).dataset.songId,
  }));
  const series = await frame.locator("#difficultyChart .chart-line").evaluateAll((paths) =>
    paths.map((path) => {
      const element = path as SVGPathElement;
      const group = element.closest(".chart-series");
      const style = getComputedStyle(element);
      return {
        commandCoordinates: element.getAttribute("d")?.match(/[-+]?\d*\.?\d+/g)?.length || 0,
        fill: style.fill,
        fillOpacity: Number(style.fillOpacity),
        marks: Array.from(group?.querySelectorAll<SVGGElement>(".chart-mark") || [], (mark) => {
          const point = mark.querySelector<SVGCircleElement>(".chart-point")!;
          const xGuide = mark.querySelector<SVGLineElement>(".chart-guide-x")!;
          const yGuide = mark.querySelector<SVGLineElement>(".chart-guide-y")!;
          return {
            cx: Number(point.getAttribute("cx")),
            cy: Number(point.getAttribute("cy")),
            date: point.dataset.date,
            difficulty: Number(point.dataset.difficulty),
            labelX: mark.querySelector(".chart-label-x")?.textContent,
            labelY: mark.querySelector(".chart-label-y")?.textContent,
            version: point.dataset.version,
            x: Number(point.dataset.x),
            xGuide: ["x1", "y1", "x2", "y2"].map((attribute) =>
              Number(xGuide.getAttribute(attribute))),
            yGuide: ["x1", "y1", "x2", "y2"].map((attribute) =>
              Number(yGuide.getAttribute(attribute))),
          };
        }),
        pathCoordinates: element.getAttribute("d")?.match(/[-+]?\d*\.?\d+/g)?.map(Number) || [],
        pathLength: element.getTotalLength(),
        pointCount: group?.querySelectorAll(".chart-point").length || 0,
        rank: element.dataset.rank,
        stroke: style.stroke,
        strokeOpacity: Number(style.strokeOpacity),
        strokeWidth: Number.parseFloat(style.strokeWidth),
        values: element.dataset.values,
      };
    }),
  );

  expect(chart).toEqual({
    ariaLabel: "Distorted Fate difficulty changes by version",
    songId: "DistortedFate.Sakuzyo",
  });
  expect(series.map(({ rank }) => rank)).toEqual(["EZ", "HD", "IN", "AT"]);
  expect(series).toHaveLength(4);
  const expectedHistory: Record<string, Array<{
    date: string;
    difficulty: number;
    version: string;
    x: number;
  }>> = {
    AT: [
      { version: "3.19.5", date: "2026-07-30", x: 1785402000, difficulty: 17.4 },
      { version: "3.11.0", date: "2025-02-14", x: 1739541660, difficulty: 17.4 },
      { version: "3.4.0", date: "2023-12-12", x: 1702366662, difficulty: 16.7 },
    ],
    IN: [
      { version: "3.19.5", date: "2026-07-30", x: 1785402000, difficulty: 16.3 },
      { version: "3.11.0", date: "2025-02-14", x: 1739541660, difficulty: 16.3 },
      { version: "3.4.0", date: "2023-12-12", x: 1702366662, difficulty: 15.9 },
    ],
    HD: [
      { version: "3.19.5", date: "2026-07-30", x: 1785402000, difficulty: 13.5 },
      { version: "3.5.0", date: "2024-02-23", x: 1708677773, difficulty: 13.5 },
      { version: "3.4.0", date: "2023-12-12", x: 1702366662, difficulty: 12.9 },
    ],
    EZ: [
      { version: "3.19.5", date: "2026-07-30", x: 1785402000, difficulty: 8.1 },
      { version: "3.9.0", date: "2024-08-29", x: 1724911551, difficulty: 8.1 },
      { version: "3.4.0", date: "2023-12-12", x: 1702366662, difficulty: 7.5 },
    ],
  };
  const allMarks = series.flatMap((line) => line.marks);
  const xValues = allMarks.map((mark) => mark.x);
  const yValues = allMarks.map((mark) => mark.difficulty);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const xPadding = (xMax - xMin) * 0.1 || 1;
  const yPadding = (yMax - yMin) * 0.1 || 1;
  const scaleX = (value: number) =>
    ((value - (xMin - xPadding)) / (xMax + xPadding - (xMin - xPadding))) * 710;
  const scaleY = (value: number) =>
    170 - ((value - (yMin - yPadding)) / (yMax + yPadding - (yMin - yPadding))) * 170;

  for (const line of series) {
    expect(line.pointCount, `${line.rank}: point count`).toBe(3);
    expect(line.commandCoordinates, `${line.rank}: path coordinate count`).toBe(6);
    expect(line.pathLength, `${line.rank}: path length`).toBeGreaterThan(0);
    expect(line.fill, `${line.rank}: fill`).toBe("none");
    expect(line.fillOpacity, `${line.rank}: fill opacity`).toBeGreaterThan(0);
    expect(line.stroke, `${line.rank}: stroke`).not.toBe("none");
    expect(line.stroke, `${line.rank}: transparent stroke`).not.toBe("rgba(0, 0, 0, 0)");
    expect(line.strokeOpacity, `${line.rank}: stroke opacity`).toBeGreaterThan(0);
    expect(line.strokeWidth, `${line.rank}: stroke width`).toBeGreaterThan(0);
    const expected = expectedHistory[line.rank || ""];
    expect(line.marks.map(({ date, difficulty, version, x }) => ({
      date,
      difficulty,
      version,
      x,
    })), `${line.rank}: plugin version fixture`).toEqual(expected);
    expect(line.values, `${line.rank}: path data binding`).toBe(expected.map((mark) =>
      `${mark.version}@${mark.date}=${mark.difficulty.toFixed(1)}`).join("|"));
    expect(line.pathCoordinates, `${line.rank}: path and point binding`)
      .toEqual(line.marks.flatMap((mark) => [mark.cx, mark.cy]));

    for (const mark of line.marks) {
      expect(mark.cx, `${line.rank} ${mark.version}: x scale`).toBeCloseTo(scaleX(mark.x), 5);
      expect(mark.cy, `${line.rank} ${mark.version}: y scale`).toBeCloseTo(scaleY(mark.difficulty), 5);
      expect(mark.labelX, `${line.rank} ${mark.version}: version label`).toBe(`v${mark.version}`);
      expect(mark.labelY, `${line.rank} ${mark.version}: difficulty label`)
        .toBe(mark.difficulty.toFixed(1));
      expect(mark.xGuide, `${line.rank} ${mark.version}: x guide`)
        .toEqual([mark.cx, mark.cy, mark.cx, 170]);
      expect(mark.yGuide, `${line.rank} ${mark.version}: y guide`)
        .toEqual([mark.cx, mark.cy, 0, mark.cy]);
    }
  }

  const visibleHistory = await frame.locator(".difficulty > .a-box").evaluateAll((groups) =>
    Object.fromEntries(groups.map((group) => [
      (group as HTMLElement).dataset.rank,
      Array.from(group.querySelectorAll<HTMLElement>(".a-num"), (entry) => ({
        date: entry.querySelector(".update-date")?.textContent?.trim(),
        difficulty: Number(entry.querySelector(".num-box")?.textContent?.trim()),
        version: entry.querySelector(".update-ver")?.textContent?.trim().replace(/^v/, ""),
        x: Number(entry.dataset.x),
      })),
    ])),
  );
  expect(visibleHistory).toEqual(expectedHistory);

  const layout = await frame.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width };
    };
    return {
      artwork: rect(document.querySelector(".header > .ill-box")!),
      artworkSources: Array.from(
        document.querySelectorAll<HTMLImageElement>(".background > img, .header > .ill-box img"),
        (image) => image.getAttribute("src"),
      ),
      body: rect(document.body),
      cards: Array.from(document.querySelectorAll(".AT-box .a-num"), rect),
      chart: rect(document.querySelector(".chart-container")!),
      content: rect(document.querySelector(".difficulty")!),
      difficultyClip: getComputedStyle(document.querySelector(".dif-box")!).clipPath,
      footer: rect(document.querySelector(".createdbox")!),
      footerFont: getComputedStyle(document.querySelector(".createdbox p")!).fontFamily,
      footerLetterSpacing: getComputedStyle(document.querySelector(".createdbox")!).letterSpacing,
      header: rect(document.querySelector(".header")!),
      historyClip: getComputedStyle(document.querySelector(".num-box")!).clipPath,
      titleBar: rect(document.querySelector(".white-bar")!),
      titleBox: rect(document.querySelector(".title-box")!),
      titleContent: rect(document.querySelector(".title-content")!),
    };
  });
  expect(layout.titleBar.left, "difficulty history: title bar starts panel")
    .toBeCloseTo(layout.titleBox.left, 0);
  expect(layout.titleContent.left, "difficulty history: content follows title bar")
    .toBeCloseTo(layout.titleBar.right, 0);
  expect(layout.titleContent.right, "difficulty history: content ends at panel")
    .toBeCloseTo(layout.titleBox.right, 0);
  expect(layout.artworkSources).toEqual([
    "/demo/difficulty-history-artwork.png",
    "/demo/difficulty-history-artwork.png",
  ]);
  expect(layout.header.left).toBeCloseTo(102.4, 1);
  expect(layout.header.top).toBeCloseTo(100, 0);
  expect(layout.artwork.width).toBeCloseTo(819, 0);
  expect(layout.artwork.height).toBeCloseTo(432, 0);
  expect(layout.chart.left).toBeCloseTo(1146, 0);
  expect(layout.chart.top).toBeCloseTo(261, 0);
  expect(layout.chart.width, "difficulty history: source chart width").toBeCloseTo(800, 0);
  expect(layout.chart.height, "difficulty history: source chart height").toBeCloseTo(250, 0);
  expect(layout.chart.right, "difficulty history: chart stays inside title content")
    .toBeLessThanOrEqual(layout.titleContent.right + 1);
  expect(layout.historyClip, "difficulty history: 70px card uses source 0.3 slope")
    .toContain("21px");
  expect(layout.difficultyClip, "difficulty history: 50px label uses source 0.3 slope")
    .toContain("15px");
  expect(layout.footerFont, "difficulty history: source footer font").toContain("Aldrich");
  expect(["normal", "0px"]).toContain(layout.footerLetterSpacing);
  expect(layout.cards.map(({ left, top, width }) => ({ left, top, width }))).toEqual([
    { left: 43.625, top: 712.015625, width: 212 },
    { left: 255.625, top: 712.015625, width: 209 },
    { left: 153.125, top: 807.015625, width: 202 },
  ]);
  expect(layout.footer.height, "difficulty history: footer height").toBeGreaterThan(0);
  expect(layout.footer.top, "difficulty history: footer follows content")
    .toBeGreaterThanOrEqual(layout.content.bottom - 0.5);
  expect(layout.footer.left, "difficulty history: footer left bound")
    .toBeGreaterThanOrEqual(layout.body.left - 0.5);
  expect(layout.footer.right, "difficulty history: footer right bound")
    .toBeLessThanOrEqual(layout.body.right + 0.5);
  expect(
    (layout.footer.left + layout.footer.right) / 2,
    "difficulty history: footer horizontal center",
  ).toBeCloseTo((layout.body.left + layout.body.right) / 2, 0);
  expect(layout.footer.bottom, "difficulty history: footer bottom bound")
    .toBeLessThanOrEqual(layout.body.bottom + 0.5);
});

test("B19 background covers the canvas and contributes to the rendered pixels", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "B19" }).click();
  const background = frame.locator(".background img");
  await background.waitFor({ state: "visible" });
  await waitForImages(frame);

  const state = await frame.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>(".background img");
    const layer = image?.closest<HTMLElement>(".background");
    const bodyRect = document.body.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const layerRect = layer?.getBoundingClientRect();
    const bodyStyle = getComputedStyle(document.body);
    const layerStyle = layer ? getComputedStyle(layer) : undefined;
    const imageStyle = image ? getComputedStyle(image) : undefined;
    const serializeRect = (rect?: DOMRect) => rect && ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    });
    return {
      bodyBackground: bodyStyle.backgroundColor,
      bodyIsolation: bodyStyle.isolation,
      bodyRect: serializeRect(bodyRect),
      imageOpacity: imageStyle?.opacity,
      imageRect: serializeRect(imageRect),
      imageLoaded: Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
      layerDisplay: layerStyle?.display,
      layerOpacity: layerStyle?.opacity,
      layerRect: serializeRect(layerRect),
      layerVisibility: layerStyle?.visibility,
      layerZIndex: layerStyle?.zIndex,
    };
  });

  expect(state.bodyBackground).toBe("rgba(0, 0, 0, 0)");
  expect(state.bodyIsolation).toBe("isolate");
  expect(state.imageLoaded).toBe(true);
  expect(state.layerDisplay).toBe("flex");
  expect(state.layerVisibility).toBe("visible");
  expect(state.layerZIndex).toBe("-1");
  expect(Number(state.layerOpacity)).toBeGreaterThan(0);
  expect(Number(state.imageOpacity)).toBeGreaterThan(0);
  expect(state.bodyRect).toBeDefined();
  expect(state.layerRect).toBeDefined();
  expect(state.imageRect).toBeDefined();
  if (state.bodyRect && state.layerRect && state.imageRect) {
    for (const [name, rect] of [["layer", state.layerRect], ["image", state.imageRect]] as const) {
      expect(rect.left, `${name} left edge`).toBeLessThanOrEqual(state.bodyRect.left + 0.5);
      expect(rect.top, `${name} top edge`).toBeLessThanOrEqual(state.bodyRect.top + 0.5);
      expect(rect.right, `${name} right edge`).toBeGreaterThanOrEqual(state.bodyRect.right - 0.5);
      expect(rect.bottom, `${name} bottom edge`).toBeGreaterThanOrEqual(state.bodyRect.bottom - 0.5);
    }
  }

  const renderedWithBackground = await frame.locator("body").screenshot({ animations: "disabled" });
  await frame.locator(".background").evaluate((element) => {
    element.setAttribute("data-test-hidden-background", element.getAttribute("style") || "");
    (element as HTMLElement).style.visibility = "hidden";
  });
  const renderedWithoutBackground = await frame.locator("body").screenshot({ animations: "disabled" });
  expect(
    renderedWithBackground.equals(renderedWithoutBackground),
    "hiding the background must change the final rendered pixels",
  ).toBe(false);
  await frame.locator(".background").evaluate((element) => {
    element.setAttribute("style", element.getAttribute("data-test-hidden-background") || "");
    element.removeAttribute("data-test-hidden-background");
  });
});

test("every render target keeps an independent editable stylesheet", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const frame = await findEditorFrame(page);
  const markers = PAGE_CASES.map((fixture, index) => ({
    ...fixture,
    marker: String(101 + index),
  }));

  for (const fixture of markers) {
    await selectFixture(page, frame, fixture);
    await page.getByTitle("主题源码").click();
    const dialog = page.getByRole("dialog", { name: "主题源码" });
    await dialog.getByLabel("CSS 源码").fill(
      `.background { --phi-page-state-marker: ${fixture.marker}; }`,
    );
    await dialog.getByRole("button", { exact: true, name: "应用" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => frame.locator(".background").evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--phi-page-state-marker").trim(),
    )).toBe(fixture.marker);
  }

  for (const fixture of [...markers].reverse()) {
    await selectFixture(page, frame, fixture);
    await expect.poll(() => frame.locator(".background").evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--phi-page-state-marker").trim(),
    )).toBe(fixture.marker);
  }
});

test("plugin settings fits all runtime rows inside the expanded canvas", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "插件设置" }).click();
  const rows = frame.locator(".box > .lineBox");
  await rows.first().waitFor({ state: "visible" });

  await expect(rows).toHaveCount(41);
  await expect(frame.locator(".box > .lineBox[data-field]")).toHaveCount(39);
  await expect(frame.locator(".box > .lineBox.divider")).toHaveCount(2);

  const metrics = await rows.evaluateAll((elements) => ({
    bodyHeight: document.body.getBoundingClientRect().height,
    rects: elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, top: rect.top };
    }),
  }));

  expect(metrics.bodyHeight).toBe(2200);
  expect(metrics.rects.at(-1)?.bottom).toBeLessThanOrEqual(metrics.bodyHeight);
  for (let index = 1; index < metrics.rects.length; index += 1) {
    expect(metrics.rects[index].top).toBeGreaterThanOrEqual(metrics.rects[index - 1].bottom - 0.5);
  }
});

test("user settings shows every dynamic group without clipping or overlap", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "用户设置" }).click();
  const groups = frame.locator('.panel > .setting-group[data-setting-key][data-phi-setting-variant="personal"]');
  await groups.first().waitFor({ state: "visible" });
  await waitForCommonFonts(frame);

  await expect(groups).toHaveCount(5);
  const content = await groups.evaluateAll((elements) => elements.map((element) => ({
    current: element.querySelector(".setting-current")?.textContent?.trim(),
    key: (element as HTMLElement).dataset.settingKey,
    options: Array.from(element.querySelectorAll(".option-title"), (option) => option.textContent?.trim()),
    selected: element.querySelector(".option-card.selected .option-title")?.textContent?.trim(),
    title: element.querySelector(".setting-title")?.textContent?.trim(),
  })));
  expect(content).toEqual([
    {
      key: "theme",
      title: "主题风格",
      current: "当前：[0]默认",
      selected: "[0]默认",
      options: ["[0]默认", "[1]寒冬", "[2]使一颗心免于哀伤", "[3]大师赛2", "[4]Milthm"],
    },
    {
      key: "b30AvgKind",
      title: "B30统计数据展示",
      current: "当前：[0]全部统计",
      selected: "[0]全部统计",
      options: ["[0]全部统计", "[1]仅 B30", "[2]仅 Top", "[3]隐藏"],
    },
    {
      key: "b30AvgColor",
      title: "B30均值条配色",
      current: "当前：[2]蓝",
      selected: "[2]蓝",
      options: ["[0]红", "[1]金", "[2]蓝", "[3]绿"],
    },
    {
      key: "allowApiUsage",
      title: "API功能开关",
      current: "当前：[0]启用",
      selected: "[0]启用",
      options: ["[0]启用", "[1]禁用"],
    },
    {
      key: "showB30Analysis",
      title: "B30统计分析",
      current: "当前：[0]显示",
      selected: "[0]显示",
      options: ["[0]显示", "[1]隐藏"],
    },
  ]);

  const layout = await frame.evaluate(() => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width };
    };
    const groupElements = Array.from(document.querySelectorAll('.panel > .setting-group[data-setting-key][data-phi-setting-variant="personal"]'));
    return {
      body: rect(document.body),
      footer: rect(document.querySelector(".createdbox")!),
      footerText: document.querySelector(".createdbox")?.textContent?.replace(/\s+/g, ""),
      groups: groupElements.map((group) => ({
        cards: Array.from(group.querySelectorAll(".option-card"), rect),
        key: (group as HTMLElement).dataset.settingKey,
        rect: rect(group),
      })),
      pageWrap: rect(document.querySelector(".page-wrap")!),
      panel: rect(document.querySelector(".panel")!),
    };
  });

  expect(layout.body.width).toBe(1080);
  expect(layout.body.height).toBe(1465);
  expect(layout.footerText).toBe("Phi-Pluginv1.0.2");
  expect(layout.pageWrap.bottom).toBeLessThanOrEqual(layout.body.bottom);
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.body.bottom);
  expect(layout.footer.top).toBeGreaterThanOrEqual(layout.panel.bottom - 0.5);
  expect(layout.footer.bottom).toBeLessThanOrEqual(layout.body.bottom);
  for (let index = 0; index < layout.groups.length; index += 1) {
    const group = layout.groups[index];
    expect(group.rect.height, `${group.key}: visible height`).toBeGreaterThan(0);
    expect(group.rect.left, `${group.key}: left bound`).toBeGreaterThanOrEqual(layout.body.left);
    expect(group.rect.right, `${group.key}: right bound`).toBeLessThanOrEqual(layout.body.right);
    if (index > 0) {
      expect(group.rect.top, `${group.key}: group overlap`).toBeGreaterThanOrEqual(
        layout.groups[index - 1].rect.bottom - 0.5,
      );
    }
    for (let left = 0; left < group.cards.length; left += 1) {
      const card = group.cards[left];
      expect(card.width, `${group.key}: card ${left + 1} width`).toBeGreaterThan(0);
      expect(card.height, `${group.key}: card ${left + 1} height`).toBeGreaterThan(0);
      expect(card.left, `${group.key}: card ${left + 1} left`).toBeGreaterThanOrEqual(group.rect.left);
      expect(card.right, `${group.key}: card ${left + 1} right`).toBeLessThanOrEqual(group.rect.right);
      for (let right = left + 1; right < group.cards.length; right += 1) {
        const other = group.cards[right];
        const overlapWidth = Math.min(card.right, other.right) - Math.max(card.left, other.left);
        const overlapHeight = Math.min(card.bottom, other.bottom) - Math.max(card.top, other.top);
        expect(Math.max(0, overlapWidth) * Math.max(0, overlapHeight), `${group.key}: cards ${left + 1}/${right + 1} overlap`).toBe(0);
      }
    }
  }

  const columnCount = (cards: Array<{ left: number }>) => new Set(cards.map((card) => Math.round(card.left))).size;
  expect(columnCount(layout.groups[0].cards)).toBe(4);
  expect(columnCount(layout.groups[1].cards)).toBe(4);
});

test("user settings API variant switches on the shared target without clipping", async ({ page }) => {
  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "用户设置" }).click();
  await frame.locator('.setting-allowDataCollection[data-phi-setting-variant="api"]').waitFor({ state: "hidden" });
  await page.getByRole("tab", { exact: true, name: "API" }).click();
  const groups = frame.locator('.panel > .setting-group[data-setting-key][data-phi-setting-variant="api"]');
  await groups.first().waitFor({ state: "visible" });
  await waitForCommonFonts(frame);

  await expect(groups).toHaveCount(5);
  await expect(frame.locator('[data-phi-setting-variant="api"] .option-card')).toHaveCount(10);
  await expect(frame.locator('[data-phi-setting-variant="api"] .option-card.selected')).toHaveCount(5);
  await expect(frame.locator('.panel > .setting-group[data-phi-setting-variant="personal"]')).toHaveCount(5);

  const metrics = await frame.evaluate(() => {
    const body = document.body.getBoundingClientRect();
    const visible = (element: Element) => (
      !element.closest("[data-phi-preview-hidden]")
      && getComputedStyle(element).display !== "none"
      && element.getBoundingClientRect().height > 0
    );
    const semantic = Array.from(document.querySelectorAll("[data-phi-selector]"))
      .filter(visible)
      .map((element) => ({
        selector: element.getAttribute("data-phi-selector"),
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.left < body.left - 1 || rect.top < body.top - 1 || rect.right > body.right + 1 || rect.bottom > body.bottom + 1);
    const apiGroups = Array.from(document.querySelectorAll<HTMLElement>('.panel > .setting-group[data-setting-key][data-phi-setting-variant="api"]'));
    return {
      body: { height: body.height, width: body.width },
      footer: document.querySelector(".createdbox")?.getBoundingClientRect(),
      groups: apiGroups.map((group) => ({
        bottom: group.getBoundingClientRect().bottom,
        key: group.dataset.settingKey,
        top: group.getBoundingClientRect().top,
      })),
      hiddenPersonal: Array.from(document.querySelectorAll('[data-phi-setting-variant="personal"]')).every((element) => element.hasAttribute("data-phi-preview-hidden")),
      overflow: semantic,
    };
  });

  expect(metrics.body.width).toBe(1080);
  expect(metrics.body.height).toBe(1320);
  expect(metrics.hiddenPersonal).toBe(true);
  expect(metrics.footer?.bottom).toBeLessThanOrEqual(metrics.body.height + 1);
  expect(metrics.groups.every((group) => group.bottom <= metrics.body.height + 1)).toBe(true);
  expect(metrics.overflow).toEqual([]);
});

test("editor survives consecutive context startups and reloads", async ({ browser }) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const context = await browser.newContext({ viewport: { width: 1800, height: 1200 } });
    await context.addInitScript(() => {
      localStorage.setItem("phi-theme-studio:guide-seen:v1", "1");
      indexedDB.deleteDatabase("keyval-store");
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(`context ${iteration}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`context ${iteration}: ${message.text()}`);
    });

    try {
      await page.goto("/");
      await findEditorFrame(page);
      await page.reload();
      const frame = await findEditorFrame(page);
      await frame.locator("[data-phi-selector]").first().waitFor({ state: "visible" });
      await page.getByRole("tab", { exact: true, name: "成绩列表" }).click();
      await frame.locator(".list_box > .line").first().waitFor({ state: "visible" });
    } finally {
      await context.close();
    }
  }

  expect(browserErrors, "browser errors during repeated startup").toEqual([]);
});

test("rejected imports keep the current page state", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/");
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "成绩列表" }).click();
  await frame.locator(".list_box > .line").first().waitFor({ state: "visible" });

  const importInput = page.locator('input[type="file"][accept=".zip,application/zip"]');
  await importInput.setInputFiles({
    name: "broken-theme.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip archive"),
  });

  await expect(page.getByText(/导入失败/).last()).toBeVisible();
  await expect(page.getByRole("tab", { exact: true, name: "成绩列表" })).toHaveAttribute("aria-selected", "true");
  await expect(frame.locator(".list_box > .line")).toHaveCount(9);
  expect(browserErrors, "browser errors during rejected import").toEqual([]);
});

async function findEditorFrame(page: Page) {
  await expect.poll(async () => {
    const counts = await Promise.all(page.frames().map((frame) => frame.locator("[data-phi-selector]").count()));
    return counts.filter((count) => count > 0).length;
  }).toBe(1);
  await expect(page.locator(".topbar-status")).toHaveAttribute("title", "已自动保存");
  return findFrameWithFixture(page);
}

async function selectFixture(page: Page, frame: Frame, fixture: PageCase) {
  const pageTab = page.getByRole("tab", { exact: true, name: fixture.tab });
  if (await pageTab.getAttribute("aria-selected") !== "true") await pageTab.click();
  await expect(pageTab).toHaveAttribute("aria-selected", "true");
  if (fixture.subTab) {
    const subTab = page.getByRole("tab", { exact: true, name: fixture.subTab });
    if (await subTab.getAttribute("aria-selected") !== "true") await subTab.click();
    await expect(subTab).toHaveAttribute("aria-selected", "true");
  }
  await frame.locator(fixture.readySelector).first().waitFor({ state: "visible" });
}

async function findFrameWithFixture(page: Page) {
  for (const frame of page.frames()) {
    if (await frame.locator("[data-phi-selector]").count()) return frame;
  }
  throw new Error("Editor fixture frame did not become ready");
}

async function waitForImages(frame: Frame) {
  await frame.waitForFunction(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }));
    return true;
  });
}

async function waitForCommonFonts(frame: Frame) {
  await frame.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "PHI"', "Phi-Plugin 123"),
      document.fonts.load('16px "Aldrich"', "Phi-Plugin 123"),
    ]);
    await document.fonts.ready;
  });
}

async function expectCompleteCardLayout(
  frame: Frame,
  selector: string,
  expectedCount: number,
  label: string,
  expectNoOverlap: boolean,
) {
  const metrics = await frame.evaluate(({ selector }) => {
    const bodyRect = document.body.getBoundingClientRect();
    const isRendered = (element: Element) => {
      if (element.closest("[data-phi-preview-hidden]")) return false;
      for (let current: Element | null = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (
          style.display === "none"
          || style.visibility === "hidden"
          || style.visibility === "collapse"
          || Number(style.opacity) <= 0
        ) return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const rects = Array.from(document.querySelectorAll(selector)).map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        index,
        left: rect.left,
        rendered: isRendered(element),
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    });
    const outsideCanvas = rects.filter((rect) => (
      rect.left < bodyRect.left - 0.5
      || rect.top < bodyRect.top - 0.5
      || rect.right > bodyRect.right + 0.5
      || rect.bottom > bodyRect.bottom + 0.5
    )).map(({ index, ...rect }) => ({ card: index + 1, ...rect }));
    const overlaps: Array<{ area: number; cards: [number, number] }> = [];
    for (let left = 0; left < rects.length; left += 1) {
      for (let right = left + 1; right < rects.length; right += 1) {
        const overlapWidth = Math.max(
          0,
          Math.min(rects[left].right, rects[right].right)
            - Math.max(rects[left].left, rects[right].left),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(rects[left].bottom, rects[right].bottom)
            - Math.max(rects[left].top, rects[right].top),
        );
        const area = overlapWidth * overlapHeight;
        if (area > 0.01) overlaps.push({ area, cards: [left + 1, right + 1] });
      }
    }
    return {
      outsideCanvas,
      overlaps,
      rects,
      unrendered: rects.filter((rect) => !rect.rendered).map((rect) => rect.index + 1),
    };
  }, { selector });

  expect(metrics.rects, `${label}: card count`).toHaveLength(expectedCount);
  expect(metrics.unrendered, `${label}: hidden cards`).toEqual([]);
  expect(metrics.outsideCanvas, `${label}: cards outside canvas`).toEqual([]);
  if (expectNoOverlap) {
    expect(metrics.overlaps, `${label}: overlapping cards`).toEqual([]);
  }
}
