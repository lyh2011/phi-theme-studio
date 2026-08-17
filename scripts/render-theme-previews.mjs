import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const PREVIEW_WIDTH = 1200;
const MIN_PREVIEW_HEIGHT = 1590;
const MAX_PREVIEW_HEIGHT = 2400;
const DEFAULT_STUDIO_URL = "http://127.0.0.1:4180";

const [inputArgument, outputArgument, studioArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  console.error(
    "Usage: npm run render:previews -- <zip-directory> <output-directory> [studio-url]",
  );
  process.exit(1);
}

const inputDirectory = path.resolve(inputArgument);
const outputDirectory = path.resolve(outputArgument);
const studioURL = new URL(studioArgument || DEFAULT_STUDIO_URL);
const archiveNames = (await readdir(inputDirectory))
  .filter((name) => name.toLowerCase().endsWith(".zip"))
  .sort((left, right) => left.localeCompare(right, "zh-CN"));

if (!archiveNames.length)
  throw new Error(`No ZIP themes found in ${inputDirectory}`);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  deviceScaleFactor: 1,
  serviceWorkers: "block",
  viewport: { width: 1800, height: 1100 },
});

await context.route("**/*", async (route) => {
  const requestURL = new URL(route.request().url());
  if (
    requestURL.protocol === "blob:" ||
    requestURL.protocol === "data:" ||
    requestURL.origin === studioURL.origin
  ) {
    await route.continue();
    return;
  }
  await route.abort("blockedbyclient");
});

const sourcePage = await context.newPage();
const browserErrors = [];
sourcePage.on("pageerror", (error) => browserErrors.push(error.message));
await sourcePage.addInitScript(() => {
  localStorage.setItem("phi-theme-studio:guide-seen:v1", "1");
});

try {
  await sourcePage.goto(studioURL.href, { waitUntil: "networkidle" });
  const importInput = sourcePage.locator('input[accept^=".zip"]');
  await importInput.waitFor({ state: "attached" });

  for (const archiveName of archiveNames) {
    const archivePath = path.join(inputDirectory, archiveName);
    const expectedThemeId = archiveName
      .replace(/-通用自定义主题包\.zip$/iu, "")
      .replace(/\.zip$/iu, "");
    await importInput.setInputFiles(archivePath);
    await sourcePage.waitForFunction(
      (fileName) => {
        const message =
          document.querySelector('[role="status"]')?.textContent || "";
        return message.startsWith("已导入") && message.includes(fileName);
      },
      archiveName,
      { timeout: 30_000 },
    );
    await sourcePage
      .locator(".brand-block span")
      .filter({ hasText: expectedThemeId })
      .waitFor({
        state: "visible",
        timeout: 30_000,
      });

    await sourcePage.getByRole("tab", { exact: true, name: "B30" }).click();
    const editorFrame = await findEditorFrame(sourcePage);
    await waitForCompletePreview(editorFrame);

    const themeId = (
      await sourcePage.locator(".brand-block span").textContent()
    )?.trim();
    if (
      !themeId ||
      themeId !== expectedThemeId ||
      !/^[a-z][a-z0-9_-]*$/.test(themeId)
    ) {
      throw new Error(
        `${archiveName}: invalid imported theme ID ${JSON.stringify(themeId)}`,
      );
    }

    const documentHTML = await editorFrame.content();
    const renderPage = await context.newPage();
    renderPage.on("pageerror", (error) =>
      browserErrors.push(`${themeId}: ${error.message}`),
    );
    try {
      await renderPage.setViewportSize({
        width: PREVIEW_WIDTH,
        height: MIN_PREVIEW_HEIGHT,
      });
      await renderPage.goto(studioURL.href, { waitUntil: "domcontentloaded" });
      await renderPage.evaluate((markup) => {
        document.open();
        document.write(markup);
        document.close();
      }, documentHTML);
      await waitForCompletePreview(renderPage.mainFrame());

      const metrics = await renderPage.evaluate(() => ({
        brokenImages: Array.from(document.images)
          .filter((image) => image.naturalWidth === 0)
          .map((image) => image.alt || image.src),
        height: Math.ceil(
          Math.max(
            document.body.getBoundingClientRect().height,
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          ),
        ),
        visibleSongs: document.querySelectorAll(
          ".song:not([data-phi-preview-hidden])",
        ).length,
        width: document.body.getBoundingClientRect().width,
      }));
      if (metrics.brokenImages.length) {
        throw new Error(
          `${themeId}: broken preview images: ${metrics.brokenImages.join(", ")}`,
        );
      }
      if (
        metrics.visibleSongs !== 30 ||
        Math.round(metrics.width) !== PREVIEW_WIDTH ||
        metrics.height < MIN_PREVIEW_HEIGHT ||
        metrics.height > MAX_PREVIEW_HEIGHT
      ) {
        throw new Error(
          `${themeId}: unexpected B30 metrics ${JSON.stringify(metrics)}`,
        );
      }

      await renderPage.setViewportSize({
        width: PREVIEW_WIDTH,
        height: metrics.height,
      });
      const image = await renderPage.screenshot({
        animations: "disabled",
        clip: { height: metrics.height, width: PREVIEW_WIDTH, x: 0, y: 0 },
        type: "png",
      });
      assertPngDimensions(image, PREVIEW_WIDTH, metrics.height, themeId);
      const outputPath = path.join(outputDirectory, `${themeId}.png`);
      await writeFile(outputPath, image);
      console.log(
        `${themeId}\t${PREVIEW_WIDTH}x${metrics.height}\t${outputPath}`,
      );
    } finally {
      await renderPage.close();
    }
  }

  if (browserErrors.length) {
    throw new Error(
      `Browser errors while rendering:\n${browserErrors.join("\n")}`,
    );
  }
} finally {
  await context.close();
  await browser.close();
}

async function findEditorFrame(page) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (
        frame !== page.mainFrame() &&
        (await frame.locator(".song").count()) > 0
      )
        return frame;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("The editor preview frame did not become ready.");
}

async function waitForCompletePreview(frame) {
  await frame.waitForFunction(
    async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }),
      );
      return (
        document.documentElement.dataset.phiPreview === "b30" &&
        document.querySelectorAll(".song:not([data-phi-preview-hidden])")
          .length === 30
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

function assertPngDimensions(buffer, expectedWidth, expectedHeight, themeId) {
  const signature = buffer.subarray(0, 8).toString("hex");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (
    signature !== "89504e470d0a1a0a" ||
    width !== expectedWidth ||
    height !== expectedHeight
  ) {
    throw new Error(`${themeId}: invalid PNG output ${width}x${height}`);
  }
}
