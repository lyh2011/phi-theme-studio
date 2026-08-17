import { expect, test, type Frame, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("phi-theme-studio:guide-seen:v1", "1");
    indexedDB.deleteDatabase("keyval-store");
  });
  await page.goto("/");
});

test("help keeps complete command text without clipping or ellipsis", async ({ page }) => {
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "帮助" }).click();
  await frame.locator(".help_box").first().waitFor({ state: "visible" });
  await waitForAssets(frame);

  const metrics = await frame.evaluate(() => ({
    background: document.querySelector<HTMLImageElement>(".background img")?.getAttribute("src"),
    brokenImages: Array.from(document.images).filter((image) => image.naturalWidth === 0).length,
    ellipsis: Array.from(document.querySelectorAll(".order p, .song p, .desc p"))
      .filter((element) => getComputedStyle(element).textOverflow === "ellipsis")
      .map((element) => element.textContent?.trim()),
    overflow: Array.from(document.querySelectorAll<HTMLElement>(".order p, .song p, .desc p"))
      .filter((element) => (
        element.scrollWidth > element.parentElement!.offsetWidth
        || element.scrollHeight > element.parentElement!.offsetHeight
      ))
      .map((element) => element.textContent?.trim()),
    rows: document.querySelectorAll(".help_box > .line").length,
  }));

  expect(metrics).toEqual({
    background: "/demo/help-background.png",
    brokenImages: 0,
    ellipsis: [],
    overflow: [],
    rows: 77,
  });
});

test("challenge artwork, titles, and fixed geometry stay paired", async ({ page }) => {
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "课题模式" }).click();
  await frame.locator(".song-box").first().waitFor({ state: "visible" });
  await waitForAssets(frame);

  const metrics = await frame.evaluate(() => ({
    background: document.querySelector<HTMLImageElement>(".background img")?.getAttribute("src"),
    cards: Array.from(document.querySelectorAll(".song-box"), (card) => {
      const rect = card.getBoundingClientRect();
      return {
        artwork: card.querySelector<HTMLImageElement>(".ill img")?.alt,
        height: rect.height,
        title: card.querySelector(".song_name p")?.textContent?.trim(),
        width: rect.width,
      };
    }),
    footerFamily: getComputedStyle(document.querySelector(".phi-plugin p")!).fontFamily,
  }));

  expect(metrics.background).toBe("/demo/clg-background.png");
  expect(metrics.cards.map(({ artwork, title }) => ({ artwork, title }))).toEqual([
    { artwork: "Snow Desert", title: "Snow Desert" },
    { artwork: "Bloom", title: "Bloom" },
    { artwork: "光", title: "光" },
  ]);
  expect(metrics.cards.every(({ height, width }) => (
    Math.abs(height - 203.796875) < 0.1 && Math.abs(width - 1519.28125) < 0.1
  ))).toBe(true);
  expect(metrics.footerFamily).toContain("Aldrich");
});

test("constant table renders all 58 decoded artworks over the matched background", async ({ page }) => {
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "定数表" }).click();
  await frame.locator(".tableBox > .content").first().waitFor({ state: "visible" });
  await waitForAssets(frame);

  const metrics = await frame.evaluate(() => ({
    background: document.querySelector<HTMLImageElement>(".background img")?.getAttribute("src"),
    brokenImages: Array.from(document.querySelectorAll<HTMLImageElement>(".tableBox .ill img"))
      .filter((image) => image.naturalWidth === 0)
      .map((image) => image.alt),
    cards: document.querySelectorAll(".tableBox .song").length,
    versionColor: getComputedStyle(document.querySelector(".phigrosVersion p")!).color,
  }));

  expect(metrics).toEqual({
    background: "/demo/table-background.png",
    brokenImages: [],
    cards: 58,
    versionColor: "rgb(0, 0, 0)",
  });
});

test("update uses the default skin and keeps the complete record canvas", async ({ page }) => {
  const frame = await findEditorFrame(page);
  await page.getByRole("tab", { exact: true, name: "存档更新" }).click();
  await frame.locator(".record_box").waitFor({ state: "visible" });
  await waitForAssets(frame);

  const metrics = await frame.evaluate(() => ({
    background: document.querySelector<HTMLImageElement>(".background img")?.getAttribute("src"),
    backgroundSizing: (() => {
      const image = document.querySelector<HTMLImageElement>(".background img")!;
      const style = getComputedStyle(image);
      return {
        maxWidth: style.maxWidth,
        naturalAspect: image.naturalWidth / image.naturalHeight,
        renderedAspect: Number.parseFloat(style.width) / Number.parseFloat(style.height),
      };
    })(),
    body: (() => {
      const rect = document.body.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    })(),
    brokenImages: Array.from(document.images).filter((image) => image.naturalWidth === 0).length,
    cards: document.querySelectorAll(".song_box .abox").length,
    challengeBadge: (() => {
      const image = document.querySelector<HTMLImageElement>(".Challenge-r img")!;
      const label = document.querySelector<HTMLElement>(".Challenge-r p")!;
      const imageRect = image.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        horizontalCenterDelta: Math.abs(
          imageRect.left + imageRect.width / 2 - (labelRect.left + labelRect.width / 2),
        ),
        marginRatio: Number.parseFloat(getComputedStyle(image).marginBottom) / imageRect.width,
        overlaps: labelRect.top < imageRect.bottom && labelRect.bottom > imageRect.top,
      };
    })(),
    font: getComputedStyle(document.body).fontFamily,
    sourceHasMilthm: document.documentElement.innerHTML.toLowerCase().includes("milthm"),
    titleOverflow: Array.from(document.querySelectorAll<HTMLElement>(".songsname p"))
      .filter((title) => {
        const container = title.parentElement!;
        return title.scrollWidth > container.clientWidth + 1
          || title.scrollHeight > container.clientHeight + 1;
      })
      .map((title) => title.textContent?.trim()),
  }));

  expect(metrics).toMatchObject({
    background: "/demo/update-background.png",
    body: { height: 931, width: 800 },
    brokenImages: 0,
    cards: 23,
    font: expect.stringContaining("PHI"),
    sourceHasMilthm: false,
    titleOverflow: [],
  });
  expect(metrics.challengeBadge.marginRatio).toBeCloseTo(-0.65, 2);
  expect(metrics.challengeBadge.horizontalCenterDelta).toBeLessThan(0.1);
  expect(metrics.challengeBadge.overlaps).toBe(true);
  expect(metrics.backgroundSizing.maxWidth).toBe("none");
  expect(metrics.backgroundSizing.renderedAspect).toBeCloseTo(metrics.backgroundSizing.naturalAspect, 3);
});

async function findEditorFrame(page: Page) {
  await expect.poll(async () => {
    const counts = await Promise.all(page.frames().map((frame) => frame.locator("[data-phi-selector]").count()));
    return counts.filter((count) => count > 0).length;
  }).toBe(1);
  for (const frame of page.frames()) {
    if (await frame.locator("[data-phi-selector]").count()) return frame;
  }
  throw new Error("Editor fixture frame did not become ready");
}

async function waitForAssets(frame: Frame) {
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
