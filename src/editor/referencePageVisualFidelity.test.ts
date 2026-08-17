// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DEFINITIONS } from "./pageRegistry";

function markup(target: keyof typeof PAGE_DEFINITIONS) {
  const template = document.createElement("template");
  template.innerHTML = PAGE_DEFINITIONS[target].markup;
  return template.content;
}

function pngDimensions(relativePath: string) {
  const bytes = readFileSync(resolve(relativePath));
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

describe("help, challenge, and table reference fidelity", () => {
  it("binds each page to the matched reference artwork", () => {
    expect(markup("help/help").querySelector(".background img")?.getAttribute("src"))
      .toBe("/demo/help-background.png");
    expect(markup("clg/clg").querySelector(".background img")?.getAttribute("src"))
      .toBe("/demo/clg-background.png");
    expect(markup("table/table").querySelector(".background img")?.getAttribute("src"))
      .toBe("/demo/table-background.png");

    expect(pngDimensions("public/demo/help-background.png")).toEqual({ width: 2048, height: 1080 });
    expect(pngDimensions("public/demo/clg-background.png")).toEqual({ width: 256, height: 135 });
    expect(pngDimensions("public/demo/table-background.png")).toEqual({ width: 256, height: 135 });
  });

  it("keeps the update fixture on the default skin and background", () => {
    const page = markup("update/update");
    expect(page.querySelector(".background img")?.getAttribute("src"))
      .toBe("/demo/update-background.png");
    expect(pngDimensions("public/demo/update-background.png"))
      .toEqual({ width: 256, height: 135 });

    const css = PAGE_DEFINITIONS["update/update"].baseCss;
    expect(css).toMatch(/margin-bottom:\s*-65%/);
    expect(css).toMatch(/height:\s*931px/);
    expect(css).toMatch(/\.background img\s*\{[^}]*width:\s*auto;[^}]*max-width:\s*none;[^}]*height:\s*100%/);
    expect(css).not.toMatch(/milthm|Update Milthm|color-mix\s*\(/i);
  });

  it("keeps every challenge title paired with its artwork", () => {
    const cards = Array.from(markup("clg/clg").querySelectorAll(".song-box"));
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => ({
      artwork: card.querySelector<HTMLImageElement>(".ill img")?.alt,
      title: card.querySelector(".song_name p")?.textContent?.trim(),
    }))).toEqual([
      { artwork: "Snow Desert", title: "Snow Desert" },
      { artwork: "Bloom", title: "Bloom" },
      { artwork: "光", title: "光" },
    ]);
  });

  it("keeps the complete help fixture without ellipsis rules", () => {
    const page = markup("help/help");
    expect(page.querySelectorAll(".help_box")).toHaveLength(8);
    expect(page.querySelectorAll(".help_box > .line")).toHaveLength(77);
    expect(Array.from(page.querySelectorAll(".order p, .song p, .desc p"))
      .every((element) => Boolean(element.textContent?.trim()))).toBe(true);
    expect(PAGE_DEFINITIONS["help/help"].baseCss).not.toMatch(/text-overflow\s*:\s*ellipsis/i);
  });
});
