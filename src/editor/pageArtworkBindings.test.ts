// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DEFINITIONS, type RenderTarget } from "./pageRegistry";

function fixture(target: RenderTarget) {
  const template = document.createElement("template");
  template.innerHTML = PAGE_DEFINITIONS[target].markup;
  return template.content;
}

function text(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function expectArtworkTitle(
  card: Element,
  titleSelector: string,
  imageSelector: string,
) {
  const title = text(card.querySelector(titleSelector));
  const image = card.querySelector<HTMLImageElement>(imageSelector);

  expect(title, `missing title in ${card.outerHTML}`).not.toBe("");
  expect(image, `missing artwork for ${title}`).not.toBeNull();
  expect(image?.alt, `artwork/title mismatch for ${title}`).toBe(title);
}

function publicAssetPath(src: string) {
  const pathname = new URL(src, "https://fixture.invalid").pathname;
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  return resolve("public", decoded);
}

function expectValidImage(src: string, target: RenderTarget) {
  const path = publicAssetPath(src);
  const bytes = readFileSync(path);
  const extension = extname(path).toLowerCase();

  expect(bytes.length, `${target}: empty image ${src}`).toBeGreaterThan(12);
  if (extension === ".png") {
    expect(
      [...bytes.subarray(0, 8)],
      `${target}: invalid PNG ${src}`,
    ).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return;
  }
  if (extension === ".webp") {
    expect(bytes.subarray(0, 4).toString("ascii"), `${target}: invalid WebP RIFF ${src}`).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii"), `${target}: invalid WebP payload ${src}`).toBe("WEBP");
    return;
  }

  throw new Error(`${target}: image fixture uses unsupported format ${src}`);
}

function artworkBindingDigest(entries: Array<{
  id: string;
  image: HTMLImageElement | null;
}>) {
  const bindings = entries.map(({ id, image }) => {
    const src = image?.getAttribute("src") ?? "";
    const bytes = readFileSync(publicAssetPath(src));
    const imageDigest = createHash("sha256").update(bytes).digest("hex");
    return `${id}\0${src}\0${imageDigest}`;
  }).join("\n");

  return createHash("sha256").update(bindings).digest("hex");
}

describe("page artwork bindings", () => {
  it("ships every referenced fixture image as a decodable local asset", () => {
    for (const definition of Object.values(PAGE_DEFINITIONS)) {
      const root = fixture(definition.target);
      const images = [...root.querySelectorAll<HTMLImageElement>("img[src]")];

      expect(images.length, `${definition.target}: no fixture images`).toBeGreaterThan(0);
      for (const image of images) {
        const src = image.getAttribute("src") ?? "";
        expect(src, `${definition.target}: non-local fixture image`).toMatch(/(?:^|\/)demo\//);
        expectValidImage(src, definition.target);
      }
    }
  });

  it("keeps Arcaea B19 artwork paired with the visible result title", () => {
    const cards = [...fixture("arcgrosB19/arcgrosB19").querySelectorAll(".song_box")];
    expect(cards).toHaveLength(33);
    for (const card of cards) {
      expectArtworkTitle(card, ".name p", ".ill_box img");
    }
  });

  it("keeps challenge and sign-in artwork paired with song titles", () => {
    const challengeCards = [...fixture("clg/clg").querySelectorAll(".song-box")];
    expect(challengeCards).toHaveLength(3);
    for (const card of challengeCards) {
      expectArtworkTitle(card, ".song_name p", ".ill img");
    }

    const signCards = [...fixture("sign/sign").querySelectorAll(".songItem")];
    expect(signCards).toHaveLength(5);
    for (const card of signCards) {
      expectArtworkTitle(card, ".songName", ".songCover img");
    }
  });

  it("keeps update task and history artwork paired with song titles", () => {
    const root = fixture("update/update");
    const taskCards = [...root.querySelectorAll(".task-song-box .abox")];
    const historyCards = [
      ...root.querySelectorAll(".song_box:not(.task-song-box) .abox"),
    ];

    expect(taskCards).toHaveLength(5);
    expect(historyCards).toHaveLength(18);
    for (const card of taskCards) {
      expectArtworkTitle(card, ".songsname p", ".imgbox img");
    }
    for (const card of historyCards) {
      expectArtworkTitle(card, ".songsname p", ".imgbox img");
    }
  });

  it.each([
    ["suggest/suggest", 18],
    ["list/list", 9],
  ] as const)("keeps %s result artwork paired with the full visible title", (target, count) => {
    const cards = [...fixture(target).querySelectorAll("article.line")];
    expect(cards).toHaveLength(count);

    for (const card of cards) {
      const visibleTitle = text(card.querySelector(".song span"));
      const image = card.querySelector<HTMLImageElement>(".ill_box img");
      expect(visibleTitle).not.toBe("");
      expect(image, `missing artwork for ${visibleTitle}`).not.toBeNull();
      expect(image?.title, `artwork/title mismatch for ${visibleTitle}`).toBe(visibleTitle);
    }
  });

  it("keeps every B30 history change bound to its own song id", () => {
    const changes = [...fixture("historyB30/historyB30").querySelectorAll<HTMLElement>(".s-song")];
    expect(changes).toHaveLength(107);

    for (const change of changes) {
      const songId = change.dataset.songId ?? "";
      const image = change.querySelector<HTMLImageElement>("img");
      expect(songId).not.toBe("");
      expect(image?.alt, `history artwork mismatch for ${songId}`).toBe(songId);
    }
  });

  it("keeps every difficulty-table artwork bound to its row song id", () => {
    const songs = [...fixture("table/table").querySelectorAll<HTMLElement>(".song[data-song-id]")];
    expect(songs).toHaveLength(58);

    for (const song of songs) {
      const songId = song.dataset.songId ?? "";
      const image = song.querySelector<HTMLImageElement>("img");
      expect(songId).not.toBe("");
      expect(image?.alt, `table artwork mismatch for ${songId}`).toBe(songId);
    }
  });

  it("uses Distorted Fate artwork for the Distorted Fate history chart", () => {
    const root = fixture("difficultyHistory/difficultyHistory");
    const songId = root.querySelector<SVGElement>("#difficultyChart")?.dataset.songId ?? "";
    const artworkAlt = root.querySelector<HTMLImageElement>(".ill-box img")?.alt ?? "";
    const normalizedTitle = artworkAlt.replace(/\bartwork\b/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

    expect(songId).toBe("DistortedFate.Sakuzyo");
    expect(songId.replace(/[^a-z0-9]/gi, "").toLowerCase()).toMatch(
      new RegExp(`^${normalizedTitle}`),
    );
  });

  it("locks the reference song-to-artwork bytes for every non-B19 result page", () => {
    const challenge = [...fixture("clg/clg").querySelectorAll(".song-box")];
    const sign = [...fixture("sign/sign").querySelectorAll(".songItem")];
    const update = [...fixture("update/update").querySelectorAll(".song_box .abox")];
    const table = [...fixture("table/table").querySelectorAll<HTMLElement>(".song[data-song-id]")];
    const history = [...fixture("historyB30/historyB30").querySelectorAll<HTMLElement>(".s-song")];
    const difficulty = fixture("difficultyHistory/difficultyHistory");

    // Each digest preserves DOM order and includes the visible/result id, source
    // path, and image bytes. This catches two otherwise plausible regressions:
    // swapping two covers while also swapping their alt text, and replacing a
    // referenced file without changing its filename.
    expect({
      challenge: artworkBindingDigest(challenge.map((card) => ({
        id: text(card.querySelector(".song_name p")),
        image: card.querySelector<HTMLImageElement>(".ill img"),
      }))),
      sign: artworkBindingDigest(sign.map((card) => ({
        id: text(card.querySelector(".songName")),
        image: card.querySelector<HTMLImageElement>(".songCover img"),
      }))),
      update: artworkBindingDigest(update.map((card) => ({
        id: text(card.querySelector(".songsname p")),
        image: card.querySelector<HTMLImageElement>(".imgbox img"),
      }))),
      table: artworkBindingDigest(table.map((card) => ({
        id: card.dataset.songId ?? "",
        image: card.querySelector<HTMLImageElement>(".ill img"),
      }))),
      history: artworkBindingDigest(history.map((card) => ({
        id: `${card.dataset.historyIndex}:${card.dataset.songId}`,
        image: card.querySelector<HTMLImageElement>(".ill img"),
      }))),
      difficulty: artworkBindingDigest([{
        id: difficulty.querySelector<SVGElement>("#difficultyChart")?.dataset.songId ?? "",
        image: difficulty.querySelector<HTMLImageElement>(".ill-box img"),
      }]),
    }).toEqual({
      challenge: "3bf7d203d99d3b19c5a142340474bca9368d3a22c9c639a498cc00afa8165bd3",
      sign: "b0e540d610cfbf2b76420705bbadd6fd2c757d7478ebae3a0ba344edbfe2ad0c",
      update: "8f5d678ff198e837485f62ab4d6c82cf53b4353f380e190279943511ca04a11c",
      table: "b4e45ffbb5a8f497c420a075c0d1282f56154411fc9cf5b7bd9612c8bee7b115",
      history: "73fcf871a472f26a32d2663bdb063c8cb51d43173230a9e86393beff5d0cd984",
      difficulty: "31b06c8110eeab04e92b993dd17b13825c386abfe8e2060f31fdf56dc18f5e87",
    });
  });
});
