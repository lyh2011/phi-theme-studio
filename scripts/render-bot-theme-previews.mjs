import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";
import JSZip from "jszip";
import YAML from "yaml";

const [
  archiveArgument,
  outputArgument,
  referenceArgument,
  pluginArgument,
  overlayArgument,
] = process.argv.slice(2);
if (
  !archiveArgument ||
  !outputArgument ||
  !referenceArgument ||
  !pluginArgument
) {
  console.error(
    "Usage: npm run render:bot-previews -- <zip-directory> <output-directory> <bot-html> <phi-plugin-root> [asset-overlay-root]",
  );
  process.exit(1);
}

const archiveDirectory = path.resolve(archiveArgument);
const outputDirectory = path.resolve(outputArgument);
const referencePath = path.resolve(referenceArgument);
const pluginRoot = path.resolve(pluginArgument);
const assetOverlayRoot = overlayArgument
  ? path.resolve(overlayArgument)
  : undefined;
const workDirectory = await mkdtemp(
  path.join(os.tmpdir(), "phi-bot-previews-"),
);
const stagedPluginRoot = path.join(workDirectory, "phi-plugin");
const stagedThemesDirectory = path.join(
  stagedPluginRoot,
  "resources",
  "html",
  "b19",
  "themes",
);

await mkdir(outputDirectory, { recursive: true });

try {
  await stagePluginResources(pluginRoot, stagedPluginRoot, assetOverlayRoot);
  const referenceHTML = await readFile(referencePath, "utf8");
  const sourcePluginRoot = findSourcePluginRoot(referenceHTML);
  const stagedReferencePath = path.join(workDirectory, "bot-reference.html");
  await writeFile(
    stagedReferencePath,
    referenceHTML.replaceAll(sourcePluginRoot, stagedPluginRoot),
  );

  const archives = (await readdir(archiveDirectory))
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  if (!archives.length)
    throw new Error(`No ZIP themes found in ${archiveDirectory}`);

  const themes = [];
  for (const archiveName of archives) {
    themes.push(
      await extractTheme(
        path.join(archiveDirectory, archiveName),
        stagedThemesDirectory,
      ),
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    viewport: { height: 1200, width: 1400 },
  });
  await context.route("http://**/*", (route) => route.abort("blockedbyclient"));
  await context.route("https://**/*", (route) =>
    route.abort("blockedbyclient"),
  );

  try {
    for (const theme of themes) {
      const page = await context.newPage();
      const browserErrors = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      try {
        await page.goto(pathToFileURL(stagedReferencePath).href, {
          waitUntil: "load",
        });
        await applyTheme(page, theme);
        await waitForRender(page);

        const metrics = await page.evaluate(() => {
          const body = document.body.getBoundingClientRect();
          return {
            brokenImages: Array.from(document.images)
              .filter((image) => image.naturalWidth === 0)
              .map((image) => image.src),
            height: Math.ceil(body.height),
            songs: document.querySelectorAll(".song").length,
            width: Math.ceil(body.width),
          };
        });
        if (metrics.brokenImages.length) {
          throw new Error(
            `${theme.id}: broken images: ${metrics.brokenImages.join(", ")}`,
          );
        }
        if (
          metrics.songs < 30 ||
          metrics.width < 1000 ||
          metrics.height < 1500
        ) {
          throw new Error(
            `${theme.id}: unexpected Bot render metrics ${JSON.stringify(metrics)}`,
          );
        }
        if (browserErrors.length) {
          throw new Error(
            `${theme.id}: browser errors: ${browserErrors.join("; ")}`,
          );
        }

        const body = await page.$("body");
        if (!body) throw new Error(`${theme.id}: Bot HTML has no body`);
        const image = await body.screenshot({
          animations: "disabled",
          type: "png",
        });
        assertPng(image, metrics.width, metrics.height, theme.id);
        const outputPath = path.join(outputDirectory, `${theme.id}.png`);
        await writeFile(outputPath, image);
        console.log(
          `${theme.id}\t${metrics.width}x${metrics.height}\t${outputPath}`,
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
} finally {
  await rm(workDirectory, { force: true, recursive: true });
}

async function stagePluginResources(sourceRoot, targetRoot, overlayRoot) {
  const sourceResources = path.join(sourceRoot, "resources");
  const targetResources = path.join(targetRoot, "resources");
  await mkdir(path.join(targetResources, "html", "b19", "themes"), {
    recursive: true,
  });

  await symlinkChildren(sourceResources, targetResources, new Set(["html"]));
  await symlinkChildren(
    path.join(sourceResources, "html"),
    path.join(targetResources, "html"),
    new Set(["b19"]),
  );
  await symlinkChildren(
    path.join(sourceResources, "html", "b19"),
    path.join(targetResources, "html", "b19"),
    new Set(["themes"]),
  );
  if (overlayRoot) {
    await symlinkMissingChildren(
      path.join(overlayRoot, "resources"),
      targetResources,
    );
  }
}

async function symlinkChildren(source, target, excluded) {
  await mkdir(target, { recursive: true });
  for (const name of await readdir(source)) {
    if (excluded.has(name)) continue;
    await symlink(path.join(source, name), path.join(target, name));
  }
}

async function symlinkMissingChildren(source, target) {
  await mkdir(target, { recursive: true });
  for (const name of await readdir(source)) {
    try {
      await symlink(path.join(source, name), path.join(target, name));
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
}

function findSourcePluginRoot(html) {
  const match = html.match(
    /([/\\][^"']+)[/\\]resources[/\\]html[/\\]common[/\\]common\.css/,
  );
  if (!match?.[1])
    throw new Error("Could not find the phi-plugin root in the Bot HTML");
  return match[1];
}

async function extractTheme(archivePath, themesDirectory) {
  const archive = await JSZip.loadAsync(await readFile(archivePath));
  const files = Object.values(archive.files).filter((entry) => !entry.dir);
  const manifestEntry = files.find((entry) =>
    /^[^/]+\/info\.yaml$/i.test(entry.name),
  );
  if (!manifestEntry)
    throw new Error(`${path.basename(archivePath)}: missing root info.yaml`);

  const root = manifestEntry.name.split("/")[0];
  const manifest = YAML.parse(await manifestEntry.async("string"));
  const id = String(manifest?.id || root);
  if (!/^[a-z][a-z0-9_-]*$/.test(id) || id !== root) {
    throw new Error(
      `${path.basename(archivePath)}: invalid theme ID ${JSON.stringify(id)}`,
    );
  }

  const themeDirectory = path.join(themesDirectory, id);
  await mkdir(themeDirectory, { recursive: true });
  for (const entry of files) {
    const normalized = path.posix.normalize(entry.name);
    if (!normalized.startsWith(`${root}/`) || normalized.includes("../")) {
      throw new Error(
        `${path.basename(archivePath)}: unsafe path ${entry.name}`,
      );
    }
    const relative = normalized.slice(root.length + 1);
    const target = path.join(themeDirectory, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await entry.async("nodebuffer"));
  }

  const fileURL = (value) => {
    if (typeof value !== "string" || !value) return undefined;
    const target = path.resolve(themeDirectory, ...value.split("/"));
    if (!target.startsWith(`${themeDirectory}${path.sep}`)) {
      throw new Error(`${id}: unsafe manifest resource ${value}`);
    }
    return pathToFileURL(target).href;
  };
  const b19Css =
    typeof manifest.css === "string"
      ? manifest.css
      : manifest.css?.["b19/b19"] || manifest.css?.b19;
  return {
    backgroundURL: fileURL(manifest.background),
    colors: Object.fromEntries(
      ["AT", "IN", "HD", "EZ"]
        .filter((key) => typeof manifest.color?.[key] === "string")
        .map((key) => [key, manifest.color[key]]),
    ),
    cssURL: fileURL(b19Css),
    fontURL: fileURL(manifest.font),
    iconURLs: Object.fromEntries(
      Object.entries(manifest.icon || {})
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, fileURL(value)]),
    ),
    id,
  };
}

async function applyTheme(page, theme) {
  await page.evaluate((input) => {
    const stylesheet = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
    ).find((link) => link.href.endsWith("/html/b19/b19.css"));
    if (!(stylesheet instanceof HTMLLinkElement) || !input.cssURL) {
      throw new Error("Bot HTML is missing the B19 stylesheet or theme css");
    }
    stylesheet.href = input.cssURL;

    const runtimeStyle = document.createElement("style");
    const colorRules = Object.entries(input.colors)
      .map(([key, value]) => `--${key}: ${value};`)
      .join(" ");
    runtimeStyle.textContent = [
      input.fontURL
        ? `@font-face { font-family: "phi-theme"; src: url("${input.fontURL}") format("truetype"); }`
        : "",
      colorRules ? `:root { ${colorRules} }` : "",
      input.fontURL
        ? 'body { font-family: "phi-theme", "PHI", "NOTO", "NotoSansJP", sans-serif; }'
        : "",
    ].join("\n");
    stylesheet.after(runtimeStyle);

    if (input.backgroundURL) {
      const background = document.querySelector(".background");
      if (background) {
        background.replaceChildren();
        const image = document.createElement("img");
        image.src = input.backgroundURL;
        image.alt = "主题背景";
        image.style.objectFit = "cover";
        image.style.minWidth = "100%";
        background.append(image);
      }
    }

    for (const image of document.querySelectorAll(".Rating img")) {
      const replacement = input.iconURLs[image.alt];
      if (replacement) image.src = replacement;
    }
  }, theme);
}

async function waitForRender(page) {
  await page.waitForFunction(
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
      if (typeof window.adjustFontSize === "function") window.adjustFontSize();
      return Array.from(document.styleSheets).some((sheet) =>
        sheet.href?.includes("/themes/"),
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

function assertPng(buffer, width, height, themeId) {
  const signature = buffer.subarray(0, 8).toString("hex");
  const actualWidth = buffer.readUInt32BE(16);
  const actualHeight = buffer.readUInt32BE(20);
  if (
    signature !== "89504e470d0a1a0a" ||
    actualWidth !== width ||
    actualHeight !== height
  ) {
    throw new Error(
      `${themeId}: invalid screenshot ${actualWidth}x${actualHeight}`,
    );
  }
}
