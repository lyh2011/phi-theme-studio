// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DEFINITIONS } from "./pageRegistry";

function fixture(target: keyof typeof PAGE_DEFINITIONS) {
  const template = document.createElement("template");
  template.innerHTML = PAGE_DEFINITIONS[target].markup;
  return template.content;
}

function text(element: ParentNode, selector: string) {
  return element.querySelector(selector)?.textContent?.trim() || "";
}

function directChildren(element: Element, className: string) {
  return Array.from(element.children).filter((child) =>
    child.classList.contains(className),
  );
}

function pngDimensions(bytes: Uint8Array) {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The B30 screenshot is a fixed fixture, not a generic sample card set. */
const EXPECTED_ARC_CARDS = [
  ["P1", "BANGING STRIKE", "15.9", "15.90", "1000000", "phi"],
  ["P2", "蝎虎天体 -Lacertid-", "15.5", "15.50", "1000000", "phi"],
  ["P3", "星拂云锦 feat. koi", "15.5", "15.50", "1000000", "phi"],
  ["#1", "DESTRUCTION 3,2,1", "17.3", "16.79", "957285", "S"],
  ["#2", "Stasis", "16.7", "16.55", "981768", "V"],
  ["#3", "祈 -我ら神祖と共に歩む者なり-", "17.3", "16.48", "930644", "S"],
  ["#4", "Re：End of a Dream", "16.9", "16.40", "974630", "V"],
  ["#5", "Distorted Fate", "17.4", "16.39", "946871", "S"],
  ["#6", "Lyrith -迷宮リリス-", "16.5", "16.38", "998471", "FC"],
  ["#7", "AbsoluTe disoRdeR", "17.2", "16.34", "933837", "S"],
  ["#8", "BANGING STRIKE", "16.8", "16.31", "970373", "V"],
  ["#9", "ATHAZA", "16.6", "16.28", "972675", "V"],
  ["#10", "祈 -我ら神祖と共に歩む者なり-", "16.4", "16.20", "975806", "V"],
  ["#11", "Ad astra per aspera", "16.3", "16.15", "964742", "V"],
  ["#12", "幻影鬼魅 (PLEASE)", "17.0", "16.13", "943956", "S"],
  ["#13", "Spasmodic", "16.7", "16.13", "939237", "S"],
  ["#14", "彩", "16.4", "16.12", "979760", "V"],
  ["#15", "PRAGMATISM -RESURRECTION-", "16.6", "16.12", "990826", "V"],
  ["#16", "夢の降る日に", "16.6", "16.11", "953536", "S"],
  ["#17", "Fractured Angel", "16.3", "16.11", "997675", "FC"],
  ["#18", "Distorted Fate", "16.3", "16.11", "997609", "FC"],
  ["#19", "Avataar ~Reincarnation of Kalpa~", "16.6", "16.08", "977803", "V"],
  ["#20", "70 Minutes Fighters", "16.5", "16.08", "943552", "S"],
  ["#21", "Cthugha", "16.1", "16.05", "999346", "FC"],
  ["#22", "Bounded Quietude", "16.2", "16.03", "996571", "FC"],
  ["#23", "NO x", "16.1", "15.99", "998630", "FC"],
  ["#24", "Incyde", "16.2", "15.99", "972357", "V"],
  ["#25", "Rrhar'il", "16.1", "15.98", "998546", "FC"],
  ["#26", "AbsoluTe disoRdeR", "16.3", "15.91", "978284", "V"],
  ["#27", "零號車輛", "16.2", "15.90", "977649", "V"],
  ["#28", "BANGING STRIKE", "15.9", "15.90", "1000000", "phi"],
  ["#29", "明鏡烈火", "15.9", "15.87", "999645", "FC"],
  ["#30", "+ERABY+E CONNEC+10N", "16.3", "15.87", "958941", "S"],
] as const;

const EXPECTED_TABLE_SECTIONS = [
  [
    ["Aleph0.LeaF", "IN"],
    ["Chronostasis.黒皇帝", "IN"],
    ["GOODRAGE.EBIMAYO", "IN"],
    ["Cthugha.USAO", "IN"],
    ["PRAGMATISMRESURRECTION.Laur", "IN"],
    ["slips.rintarosoma", "IN"],
  ],
  [
    ["NonMelodicRagezMUGEdit.Normal1zer", "IN"],
    ["Igallta.SeURa", "IN"],
    ["Rrharil.TeamGrimoire", "IN"],
    ["Cthugha.USAO", "AT"],
    ["RESSiSTANCE.ぐるたみん", "IN"],
    ["NOx.Juggernaut", "IN"],
    ["DerSchneid.Ωμεγα", "IN"],
    ["Lyrith迷宮リリス.ユメミド", "IN"],
  ],
  [
    ["Retribution.nmyKryexe", "IN"],
    ["Shadow.SumaiLightvs姜米條", "AT"],
    ["零號車輛.seatrus", "IN"],
    ["SATELLITE.かめりあ", "AT"],
    ["BoundedQuietude.FiniteLimitvsSiLiS", "IN"],
    ["RetributionCycleofRedemption.ArdolfvsDaily天利", "IN"],
    ["Incyde.YbeLL", "IN"],
    ["Poseidon.1112vsStar", "AT"],
  ],
  [
    ["ChronosCollapseLaCampanella.SunsetRay", "IN"],
    ["DESTRUCTION321.Normal1zervsBrokenNerdz", "IN"],
    ["DistortedFate.Sakuzyo", "IN"],
    ["Adastraperaspera.RabbitHouse", "IN"],
    ["ERABYECONNEC10N.かめりあ", "IN"],
    ["FracturedAngel.DJRaisei", "IN"],
    ["AbsoluTedisoRdeR.AcuteDisarray", "IN"],
    ["QZKagoRequiem.tpazolite", "IN"],
  ],
  [
    ["狂喜蘭舞.LeaF", "AT"],
    ["CROSSSOUL.HyuNfeatSyepias", "IN"],
    ["祈-我ら神祖と共に歩む者なり-.光吉猛修VS穴山大輔VSKaiVS水野健治VS大国奏音", "IN"],
    ["Antithese.Blacklolita", "AT"],
    ["KIZUNAResolution.TAG", "IN"],
    ["彩.MisoilePunch", "IN"],
  ],
  [
    ["IndelibleScar.Noah", "AT"],
    ["StardustRAY.kanonevsBlackY", "IN"],
    ["Verruckt.Raimukun", "IN"],
    ["70MinutesFighters.かたぎり", "IN"],
    ["Lyrith迷宮リリス.ユメミド", "AT"],
    ["Ark.kanoryo", "AT"],
    ["PANICPARADISE.DJSHIONY", "AT"],
  ],
  [
    ["volcanic.DETROakaルゼ", "AT"],
    ["PRAGMATISMRESURRECTION.Laur", "AT"],
    ["AvataarReincarnationofKalpa.ScarletteakaCrYmson", "AT"],
    ["GungnirFracture.Kryexe", "IN"],
    ["夢の降る日に.seatrus", "IN"],
    ["ATHAZA.LeaF", "AT"],
  ],
  [
    ["Spasmodic.姜米條颶風元力上人", "AT"],
    ["Stasis.Maozon", "AT"],
    ["Cuvism.Fl00tvsHalv", "AT"],
    ["DiamondDust.MasahiroGodspeedAoki", "AT"],
  ],
  [
    ["slips.rintarosoma", "AT"],
    ["BANGINGSTRIKE.DewPleiades", "AT"],
    ["INFiNiTEENERZYOverdoze.RekuMochizuki", "AT"],
  ],
  [
    ["ReEndofaDream.umavsモリモリあつし", "AT"],
    ["DerRichter.Ωμεγα", "AT"],
  ],
] as const;

describe("page fixture fidelity", () => {
  it("matches all 3 Phi and 30 Best records in the Arcaea B30 reference", () => {
    const root = fixture("arcgrosB19/arcgrosB19");
    const cards = Array.from(root.querySelectorAll(".box > .song_box"));
    const actual = cards.map((card) => [
      text(card, ".num"),
      text(card, ".name"),
      text(card, ".difficulty"),
      text(card, ".rks"),
      text(card, ".score").replace(/\D/g, "").replace(/^0(?=\d{6}$)/, ""),
      card.querySelector<HTMLImageElement>(".rating_box img")?.getAttribute("alt"),
    ]);

    expect(cards).toHaveLength(33);
    expect(actual).toEqual(EXPECTED_ARC_CARDS);
    expect(cards.map((card) => {
      const title = text(card, ".name");
      const artwork = card.querySelector<HTMLImageElement>(".ill_box > img");
      return [artwork?.getAttribute("alt"), title];
    })).toEqual(EXPECTED_ARC_CARDS.map(([, title]) => [title, title]));
    expect(text(root, ".player_id p")).toBe("lyh");
    expect(text(root, ".rks_num p").replace(/\s+/g, "")).toBe("16.13");
    expect(text(root, ".arcChallenge p")).toBe("48");
    expect(root.querySelector(".Challenge_broad")?.classList).toContain("c-3");
    expect(root.querySelector(".arcChallenge")?.classList).toContain("ac-3");

    for (const card of cards) {
      expect(text(card, ".difficulty")).toMatch(/^\d{2}\.\d$/);
      expect(text(card, ".name")).not.toBe("");
      const artwork = card.querySelector<HTMLImageElement>(".ill_box > img");
      expect(artwork?.getAttribute("src")).toMatch(/\/demo\//);
      expect(artwork?.getAttribute("src")).not.toMatch(/^https?:/);
      expect(artwork?.getAttribute("alt")).not.toMatch(/^(?:Artwork|)$/);
      expect(card.querySelector<HTMLImageElement>(".rating_box img")?.getAttribute("alt"))
        .toMatch(/^(?:phi|FC|V|S|A|B|C)$/);
    }
  });

  it("keeps the runtime Arcaea score-card structure and reference difficulty branches", () => {
    const root = fixture("arcgrosB19/arcgrosB19");
    const cards = Array.from(root.querySelectorAll(".box > .song_box"));
    const ranks = new Set<string>();

    for (const card of cards) {
      expect(directChildren(card, "num_box")).toHaveLength(1);
      expect(directChildren(card, "difficulty_box")).toHaveLength(1);
      expect(directChildren(card, "acc_box")).toHaveLength(1);
      expect(directChildren(card, "borad_up")).toHaveLength(1);
      expect(directChildren(card, "borad_down_box")).toHaveLength(1);
      expect(card.querySelector(":scope > .borad_up > .rks_box > .rating_box > img"))
        .not.toBeNull();
      expect(card.querySelector(":scope > .borad_up > .ill_box > img"))
        .not.toBeNull();
      expect(card.querySelector(":scope > .borad_up > .ill_box > .score > p"))
        .not.toBeNull();
      expect(card.querySelector(":scope > .borad_down_box > .borad_down > .name > p"))
        .not.toBeNull();

      const rank = card.querySelector(".difficulty")?.classList;
      for (const candidate of ["EZ", "HD", "IN", "AT"]) {
        if (rank?.contains(candidate)) ranks.add(candidate);
      }
    }

    expect([...ranks].sort()).toEqual(["AT", "IN"]);
    expect(root.querySelector(".phigros > img")?.getAttribute("src"))
      .toMatch(/\/demo\/arcgros\.png$/);
    expect(root.querySelector(".background > img")?.getAttribute("src"))
      .toMatch(/\/demo\/arcgros-background\.png$/);
    expect(root.querySelector(".player_broad > img")?.getAttribute("src"))
      .toMatch(/\/demo\/arcgros-background\.png$/);
    expect(root.querySelector(".player_avatar > img")?.getAttribute("src"))
      .toMatch(/\/demo\/avatar-lyh\.png$/);
  });

  it("resolves every Arcaea fixture image to a non-empty decodable PNG asset", () => {
    const root = fixture("arcgrosB19/arcgrosB19");
    const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
    const sources = new Set(images.map((image) => image.getAttribute("src") || ""));

    expect(images.length).toBeGreaterThanOrEqual(70);
    expect(sources.size).toBeGreaterThanOrEqual(31);
    for (const source of sources) {
      const demoOffset = source.indexOf("/demo/");
      expect(demoOffset, `fixture image is not under /demo/: ${source}`).toBeGreaterThanOrEqual(0);
      const relativePath = source.slice(demoOffset + "/demo/".length);
      const bytes = readFileSync(resolve(process.cwd(), "public", "demo", relativePath));
      const dimensions = pngDimensions(bytes);
      expect(bytes.byteLength, source).toBeGreaterThan(100);
      expect(dimensions.width, source).toBeGreaterThan(0);
      expect(dimensions.height, source).toBeGreaterThan(0);
      if (relativePath === "arcgros.png") expect(dimensions).toEqual({ width: 2000, height: 755 });
    }
  });

  it("matches all seven suggestion bands and all 18 screenshot records", () => {
    const root = fixture("suggest/suggest");
    const definition = PAGE_DEFINITIONS["suggest/suggest"];
    const groups = Array.from(root.querySelectorAll(".group_list > .group"));
    const rowsPerGroup = groups.map((group) =>
      directChildren(group.querySelector(".row_box")!, "line").length,
    );
    const cards = groups.flatMap((group) =>
      directChildren(group.querySelector(".row_box")!, "line"),
    );

    expect(groups).toHaveLength(7);
    expect(rowsPerGroup).toEqual([3, 3, 3, 2, 3, 3, 1]);
    expect(cards).toHaveLength(18);
    const titles = groups.map((group) => text(group, ".group_title"));
    expect(titles[0]).toBe("phi");
    expect(titles.slice(1)).toEqual([
      "99.85% ~ 100%",
      "99.70% ~ 99.85%",
      "99.50% ~ 99.70%",
      "99.00% ~ 99.50%",
      "98.50% ~ 99.00%",
      "00.00% ~ 98.50%",
    ]);
    const expectedCards = [
      [
        ["1", "インフェルノシティ - Ponchi♪ feat. はぁち", "IN", "15.7", "AP Count", "3813 / 6841", "IN", 5, "/demo/suggest-covers/inferno-city.png", "phi"],
        ["2", "GOODRAGE - EBIMAYO", "IN", "16", "AP Count", "3100 / 6932", "IN", 5, "/demo/suggest-covers/goodrage.png", "phi"],
        ["3", "a truth seeker -Communication with Utopia will be lost- - kuro", "IN", "15.8", "AP Count", "3086 / 6619", "IN", 5, "/demo/suggest-covers/a-truth-seeker.png", "phi"],
      ],
      [
        ["1", "Aleph-0 - LeaF", "IN", "16", "98.5763%", "> 99.9050", "957017", 5, "/demo/suggest-covers/aleph-0.png", "S"],
        ["2", "GOODRAGE - EBIMAYO", "IN", "16", "98.6364%", "> 99.9050", "933279", 5, "/demo/suggest-covers/goodrage.png", "S"],
        ["3", "Cthugha - USAO", "IN", "16", "98.9872%", "> 99.9050", "949325", 5, "/demo/suggest-covers/cthugha.png", "S"],
      ],
      [
        ["1", "Non-Melodic Ragez (MUG Edit) - Normal1zer", "IN", "16.1", "96.7733%", "> 99.7653", "925049", 4, "/demo/suggest-covers/non-melodic-ragez.png", "S"],
        ["2", "Igallta - Se-U-Ra", "IN", "16.1", "98.0305%", "> 99.7653", "939150", 4, "/demo/suggest-covers/igallta.png", "S"],
        ["3", "Der Schneid - Ωμεγα", "IN", "16.1", "99.3794%", "> 99.7653", "954439", 4, "/demo/suggest-covers/der-schneid.png", "S"],
      ],
      [
        ["1", "Retribution - nm-y & Kry.exe", "IN", "16.2", "99.2158%", "> 99.6269", "937566", 3, "/demo/suggest-covers/retribution.png", "S"],
        ["2", "Retribution ~ Cycle of Redemption ~ - Ardolf vs. Daily天利", "IN", "16.2", "99.2244%", "> 99.6269", "935496", 3, "/demo/suggest-covers/retribution-cycle.png", "S"],
      ],
      [
        ["1", "Chronos Collapse - La Campanella - SunsetRay", "IN", "16.3", "97.9533%", "> 99.4898", "944757", 2, "/demo/suggest-covers/chronos-collapse.png", "S"],
        ["2", "+ERABY+E CONNEC+10N - かめりあ", "IN", "16.3", "99.3987%", "> 99.4898", "958941", 2, "/demo/suggest-covers/eraby-connection.png", "S"],
        ["3", "CROSS†SOUL - HyuN feat. Syepias", "IN", "16.4", "99.0421%", "> 99.3540", "954598", 2, "/demo/suggest-covers/cross-soul.png", "S"],
      ],
      [
        ["1", "幻影鬼魅 (PLEASE) - R300K", "AT", "17", "98.8384%", "> 98.8794", "943956", 1, "/demo/suggest-covers/phantom-please.png", "S"],
        ["2", "AbsoluTe disoRdeR - Acute Disarray", "AT", "17.2", "98.8568%", "> 98.8972", "933837", 1, "/demo/suggest-covers/absolute-disorder.png", "S"],
        ["3", "祈 -我ら神祖と共に歩む者なり- - 光吉猛修 VS 穴山大輔 VS Kai VS 水野健治 VS 大国奏音", "AT", "17.3", "98.9154%", "> 98.9556", "930644", 1, "/demo/suggest-covers/inori.png", "S"],
      ],
      [
        ["1", "+ERABY+E CONNEC+10N - かめりあ", "AT", "17.3", "98.0652%", "> 98.1848", "928439", 0, "/demo/suggest-covers/eraby-connection.png", "S"],
      ],
    ];
    const actualCards = groups.map((group) =>
      directChildren(group.querySelector(".row_box")!, "line").map((card) => {
        const difficulty = card.querySelector(".dif");
        const rank = ["AT", "IN", "HD", "EZ"]
          .find((candidate) => difficulty?.classList.contains(candidate)) || "";
        const kindClass = Array.from(card.querySelector(".suggest")?.classList || [])
          .find((className) => className.startsWith("suggest-kind-"));
        return [
          text(card, ".num"),
          text(card, ".song"),
          rank,
          text(card, ".dif"),
          text(card, ".acc .box-content"),
          text(card, ".suggest"),
          text(card, ".score"),
          Number(kindClass?.replace("suggest-kind-", "")),
          card.querySelector<HTMLImageElement>(".ill_box img")?.getAttribute("src"),
          card.querySelector<HTMLImageElement>(".rating img")?.getAttribute("alt"),
        ];
      }),
    );
    expect(actualCards).toEqual(expectedCards);
    expect(definition.baseCss).not.toMatch(/text-overflow:\s*ellipsis/i);

    // Re-run the plugin's `fCompute.rks`/`suggestType` rules over the rendered
    // values. This catches internally inconsistent fixtures even when a typo is
    // copied into both the markup and the expected screenshot table above.
    const rksAt = (acc: number, difficulty: number) =>
      difficulty * ((acc - 55) / 45) ** 2;
    const suggestionKind = (suggestion: number) => {
      if (suggestion < 98.5) return 0;
      if (suggestion < 99) return 1;
      if (suggestion < 99.5) return 2;
      if (suggestion < 99.7) return 3;
      if (suggestion < 99.85) return 4;
      return 5;
    };
    const b19TargetRks = 15.9325;
    const perRecordTargetIncrease = 0.03;

    for (const card of cards.filter((card) => !card.closest(".group-phi"))) {
      const difficulty = Number(text(card, ".dif"));
      const currentAcc = Number(text(card, ".acc .box-content").replace("%", ""));
      const suggestedAcc = Number(text(card, ".suggest").replace(">", ""));
      const currentRks = rksAt(currentAcc, difficulty);
      const targetRks = rksAt(suggestedAcc, difficulty);
      const kindClass = Array.from(card.querySelector(".suggest")?.classList || [])
        .find((className) => className.startsWith("suggest-kind-"));

      expect(Number(kindClass?.replace("suggest-kind-", ""))).toBe(
        suggestionKind(suggestedAcc),
      );
      expect(targetRks).toBeCloseTo(
        Math.max(b19TargetRks, currentRks + perRecordTargetIncrease),
        3,
      );
    }

    for (const card of cards) {
      expect(text(card, ".song")).not.toBe("");
      expect(card.querySelector(":scope .song > span")).not.toBeNull();
      const acc = text(card, ".acc .box-content");
      if (card.closest(".group-phi")) {
        expect(acc).toBe("AP Count");
        expect(text(card, ".suggest")).toMatch(/^\d{4} \/ \d{4}$/);
        expect(text(card, ".score")).toMatch(/^(?:AT|IN|HD|EZ)$/);
      } else {
        expect(acc).toMatch(/^\d{2,3}\.\d{4}%$/);
        expect(text(card, ".score")).toMatch(/^\d{6,7}$/);
      }
      expect(card.querySelector(".ill_box img")).not.toBeNull();
      expect(card.querySelector<HTMLImageElement>(".ill_box img")?.title).toBe(text(card, ".song"));
      expect(card.querySelector(".rating img")).not.toBeNull();
    }
  });

  it("matches the 3.19.5 difficulty-16 constant table and its source order", () => {
    const root = fixture("table/table");
    const table = root.querySelector(".tableBox")!;
    const labels = directChildren(table, "label");
    const contents = directChildren(table, "content");
    const cards = Array.from(root.querySelectorAll(".tableBox .song"));
    const displayedTotal = Number(text(root, ".queryDifficulty .total").replace(/\D/g, ""));

    expect(Array.from(table.children).map((child) => child.className)).toEqual(
      Array.from({ length: 10 }, () => ["label", "content"]).flat(),
    );
    expect(labels.map((label) => text(label, ".labelContent p")))
      .toEqual(["16.0", "16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.7", "16.8", "16.9"]);
    expect(contents.map((content) => directChildren(content, "song").length))
      .toEqual([6, 8, 8, 8, 6, 7, 6, 4, 3, 2]);
    expect(cards).toHaveLength(58);
    expect(displayedTotal).toBe(cards.length);
    expect(text(root, ".phigrosVersion")).toBe("3.19.5");
    expect(text(root, ".queryDifficulty .index > p")).toBe("16");
    expect(root.querySelector(".playerInfoRow")).toBeNull();
    expect(root.querySelector(".difficulty-section")).toBeNull();
    expect(root.querySelector(".labelContent img")).toBeNull();
    expect(root.querySelector(".score")).toBeNull();

    expect(contents.map((content) => directChildren(content, "song").map((card) => [
      (card as HTMLElement).dataset.songId,
      text(card, ".rank"),
    ]))).toEqual(EXPECTED_TABLE_SECTIONS);

    for (const card of cards) {
      const artwork = card.querySelector<HTMLImageElement>(".ill > img");
      expect(artwork).not.toBeNull();
      expect(artwork?.getAttribute("src")).toMatch(/\/demo\//);
      expect(artwork?.getAttribute("src")).not.toMatch(/^https?:/);
      expect(artwork?.getAttribute("alt")).toBe((card as HTMLElement).dataset.songId);
      expect(text(card, ".rank")).toMatch(/^(?:AT|IN|HD|EZ)$/);
      expect(card.querySelector(".rankBlock")).not.toBeNull();
    }
  });

  it("provides nine complete list records for the three-column layout", () => {
    const root = fixture("list/list");
    const definition = PAGE_DEFINITIONS["list/list"];
    const list = root.querySelector(".list_box");
    expect(list).not.toBeNull();
    expect(text(root, ".head_title")).toBe("成绩筛选");
    const records = directChildren(list!, "line");

    expect(records).toHaveLength(9);
    expect(records.map((record) => text(record, ".num")))
      .toEqual(Array.from({ length: 9 }, (_, index) => String(index + 1)));
    expect(records.map((record) => {
      const difficulty = record.querySelector(".dif");
      const rank = ["AT", "IN", "HD", "EZ"]
        .find((candidate) => difficulty?.classList.contains(candidate));
      const artwork = record.querySelector<HTMLImageElement>(".ill_box img");
      return [
        (record as HTMLElement).dataset.songId,
        text(record, ".song"),
        rank,
        text(record, ".dif"),
        text(record, ".acc .box-content"),
        text(record, ".suggest"),
        text(record, ".score"),
        record.querySelector<HTMLImageElement>(".rating img")?.alt,
        artwork?.getAttribute("src"),
      ];
    })).toEqual([
      ["AbsoluTedisoRdeR.AcuteDisarray", "AbsoluTe disoRdeR - Acute Disarray", "AT", "17.2", "98.8568%", "> 98.8972%", "933837", "S", "/demo/suggest-covers/absolute-disorder.png"],
      ["幻影鬼魅PLEASE.R300K", "幻影鬼魅 (PLEASE) - R300K", "AT", "17.0", "98.8384%", "> 98.8794%", "943956", "S", "/demo/suggest-covers/phantom-please.png"],
      ["CROSSSOUL.HyuNfeatSyepias", "CROSS†SOUL - HyuN feat. Syepias", "IN", "16.4", "99.0421%", "> 99.3540%", "954598", "S", "/demo/suggest-covers/cross-soul.png"],
      ["ChronosCollapseLaCampanella.SunsetRay", "Chronos Collapse - La Campanella - SunsetRay", "IN", "16.3", "97.9533%", "> 99.4898%", "944757", "S", "/demo/suggest-covers/chronos-collapse.png"],
      ["Retribution.nmyKryexe", "Retribution - nm-y & Kry.exe", "IN", "16.2", "99.2158%", "> 99.6269%", "937566", "S", "/demo/suggest-covers/retribution.png"],
      ["Igallta.SeURa", "Igallta - Se-U-Ra", "IN", "16.1", "98.0305%", "> 99.7653%", "939150", "S", "/demo/suggest-covers/igallta.png"],
      ["Cthugha.USAO", "Cthugha - USAO", "IN", "16.0", "98.9872%", "> 99.9050%", "949325", "S", "/demo/suggest-covers/cthugha.png"],
      ["GOODRAGE.EBIMAYO", "GOODRAGE - EBIMAYO", "HD", "8.5", "100.0000%", "> 无法推分", "1000000", "phi", "/demo/suggest-covers/goodrage.png"],
      ["Aleph0.LeaF", "Aleph-0 - LeaF", "EZ", "3.5", "100.0000%", "> 无法推分", "1000000", "phi", "/demo/suggest-covers/aleph-0.png"],
    ]);
    expect(new Set(records.map((record) => ["AT", "IN", "HD", "EZ"]
      .find((candidate) => record.querySelector(".dif")?.classList.contains(candidate)))))
      .toEqual(new Set(["AT", "IN", "HD", "EZ"]));
    expect(definition.baseCss).not.toMatch(/text-overflow:\s*ellipsis/i);

    for (const record of records) {
      expect(text(record, ".song")).not.toBe("");
      expect(record.querySelector(":scope .song > span")).not.toBeNull();
      expect(text(record, ".acc .box-content")).toMatch(/^\d{2,3}\.\d{4}%$/);
      expect(text(record, ".score")).toMatch(/^\d{6,7}$/);
      const artwork = record.querySelector<HTMLImageElement>(".ill_box img");
      expect(artwork).not.toBeNull();
      expect(artwork?.alt).toBe((record as HTMLElement).dataset.songId);
      expect(artwork?.title).toBe(text(record, ".song"));
      expect(record.querySelector(".rating img")).not.toBeNull();
    }
  });

  it("matches the complete 21-date, 107-change B30 history timeline", () => {
    const root = fixture("historyB30/historyB30");
    const definition = PAGE_DEFINITIONS["historyB30/historyB30"];
    const rows = Array.from(root.querySelectorAll(".main-box > .row"));
    const dates = rows.map((row) => row.getAttribute("data-date") || "");

    expect(root.querySelector(".background > img")?.getAttribute("src"))
      .toMatch(/\/demo\/history-background\.png$/);
    expect(definition.baseCss).toMatch(/\.background img\s*\{[^}]*width:\s*auto;[^}]*height:\s*100%;[^}]*transform:\s*scale\(1\.2\);[^}]*filter:\s*blur\(20px\)\s+brightness\(50%\)/);
    expect(rows).toHaveLength(21);
    expect(rows.map((row) => text(row, ".row-date"))).toEqual(dates);
    expect(dates).toEqual([
      "2026/08/14 15:28:02",
      "2026/08/14 13:19:58",
      "2026/08/09 22:44:49",
      "2026/08/09 19:24:39",
      "2026/08/09 09:36:52",
      "2026/08/07 12:54:42",
      "2026/08/06 14:39:23",
      "2026/08/01 14:45:09",
      "2026/07/29 15:23:47",
      "2026/07/14 22:53:47",
      "2026/07/08 18:37:33",
      "2026/07/06 22:38:08",
      "2026/07/04 22:21:23",
      "2026/05/22 21:55:41",
      "2026/05/08 21:48:32",
      "2026/05/02 10:37:01",
      "2026/03/01 16:41:54",
      "2025/12/28 11:48:59",
      "2025/12/21 11:12:34",
      "2025/12/20 21:37:38",
      "2025/12/19 20:44:48",
    ]);
    expect(rows.every((row) => row.querySelectorAll(".s-song").length > 0)).toBe(true);

    const entering = Array.from(root.querySelectorAll('.s-song[data-change="enter"]'));
    const exiting = Array.from(root.querySelectorAll('.s-song[data-change="exit"]'));
    const changes = Array.from(root.querySelectorAll<HTMLElement>(".s-song"));
    expect(changes).toHaveLength(107);
    expect(entering).toHaveLength(68);
    expect(exiting).toHaveLength(39);
    expect(entering.every((song) => song.querySelector(".phiTag, .b27Tag"))).toBe(true);
    expect(exiting.every((song) => song.querySelector(".exitTag"))).toBe(true);
    expect(root.querySelectorAll(".phiTag")).toHaveLength(8);
    expect(root.querySelectorAll(".b27Tag")).toHaveLength(61);

    expect(changes.map((change) => change.dataset.historyIndex)).toEqual(
      Array.from({ length: 107 }, (_, index) => String(index + 1)),
    );
    expect(changes.slice(0, 6).map((change) => ({
      change: change.dataset.change,
      difficulty: change.dataset.difficulty,
      songId: change.dataset.songId,
    }))).toEqual([
      { change: "enter", difficulty: "AT", songId: "AbsoluTedisoRdeR.AcuteDisarray" },
      { change: "exit", difficulty: "IN", songId: "BANGINGSTRIKE.DewPleiades" },
      { change: "enter", difficulty: "IN", songId: "FracturedAngel.DJRaisei" },
      { change: "exit", difficulty: "IN", songId: "明鏡烈火.MUEvsRekuMochizuki" },
      { change: "enter", difficulty: "IN", songId: "Rrharil.TeamGrimoire" },
      { change: "exit", difficulty: "IN", songId: "ERABYECONNEC10N.かめりあ" },
    ]);
    expect(changes.at(-1)?.dataset.songId).toBe("ATHAZA.LeaF");

    for (const change of changes) {
      const artwork = change.querySelector<HTMLImageElement>(".ill > img");
      expect(artwork).not.toBeNull();
      expect(artwork?.src).toContain("/demo/song-covers/");
      expect(artwork?.getAttribute("src")).not.toMatch(/^https?:/);
      expect(artwork?.alt).toBe(change.dataset.songId);
      expect(artwork?.dataset.songId).toBe(change.dataset.songId);
      expect(text(change, ".levelKind")).toBe(change.dataset.difficulty);
    }
  });

  it("matches the complete dynamic user-setting result shown by the plugin", () => {
    const root = fixture("setting/userSetting");
    const expected = [
      {
        key: "theme",
        title: "主题风格",
        current: "当前：[0]默认",
        selected: "[0]默认",
        options: [
          "[0]默认",
          "[1]寒冬",
          "[2]使一颗心免于哀伤",
          "[3]大师赛2",
          "[4]Milthm",
        ],
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
    ] as const;
    const groups = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.panel > .setting-group[data-setting-key][data-phi-setting-variant="personal"]',
      ),
    );

    expect(groups.map((group) => group.dataset.settingKey)).toEqual(
      expected.map(({ key }) => key),
    );
    expect(root.querySelectorAll('[data-phi-setting-variant="personal"] .option-card')).toHaveLength(17);
    expect(root.querySelectorAll('[data-phi-setting-variant="personal"] .option-card.selected')).toHaveLength(expected.length);

    for (const [index, group] of groups.entries()) {
      const contract = expected[index];
      const cards = directChildren(group.querySelector(".option-row")!, "option-card");
      expect(group.getAttribute("data-phi-selector")).toBe(`.setting-${contract.key}`);
      expect(text(group, ".setting-title")).toBe(contract.title);
      expect(text(group, ".setting-current")).toBe(contract.current);
      expect(text(group, ".setting-desc")).not.toBe("");
      expect(cards.map((card) => text(card, ".option-title"))).toEqual(contract.options);
      expect(cards.every((card) => text(card, ".option-desc") !== "")).toBe(true);
      const selected = cards.filter((card) => card.classList.contains("selected"));
      expect(selected).toHaveLength(1);
      expect(text(selected[0], ".option-title")).toBe(contract.selected);
      expect(text(selected[0], ".option-tag")).toBe("已选中");
    }

    expect(
      Array.from(groups[0].querySelectorAll(".option-desc"), (option) => option.textContent?.trim()),
    ).toEqual([
      "使用插件基础主题，使用随机曲绘作为背景。",
      "在默认的基础上加入飘落雪花元素。",
      "飞萤之火自无梦的长夜亮起，绽放在终竟的明天。",
      "Phigros 大师赛第二赛季主题配色",
      "所有词语，都是雨的旋律",
    ]);
    expect(root.querySelector(".setting-ratingIcon")).toBeNull();

    const apiExpected = [
      {
        key: "allowDataCollection",
        title: "数据收集同意",
        current: "当前：[1]同意",
        selected: "[1]同意",
        description: "控制是否同意插件收集你的游戏数据（如成绩、游玩时间等）用于统计分析和功能优化，帮助我们改进插件性能和用户体验。关闭后将同步禁用下方所有选项。",
        options: ["[1]同意", "[0]拒绝"],
        optionDescriptions: ["", "插件将仅使用本地数据，不会上传任何信息。"],
      },
      {
        key: "allowLeaderboard",
        title: "排行榜展示",
        current: "当前：[1]同意",
        selected: "[1]同意",
        description: "同意将你的成绩展示在在线排行榜中，供其他玩家查看和比较。",
        options: ["[1]同意", "[0]拒绝"],
        optionDescriptions: ["", "你的成绩将不会在排行榜中展示。"],
      },
      {
        key: "allowDataAggregation",
        title: "数据聚合",
        current: "当前：[1]同意",
        selected: "[1]同意",
        description: "同意将你的成绩数据匿名化后用于整体统计分析，分析结果将用于推分建议以及谱面分析、定位等功能。",
        options: ["[1]同意", "[0]拒绝"],
        optionDescriptions: ["", "拒绝将你的成绩数据用于统计分析，插件将不会使用你的数据进行任何形式的分析或报告。"],
      },
      {
        key: "allowPlayerIdSearch",
        title: "玩家ID搜索",
        current: "当前：[1]同意",
        selected: "[1]同意",
        description: "同意其他玩家通过你游戏中的的玩家ID搜索到你的成绩信息，便于社交互动和成绩比较。",
        options: ["[1]同意", "[0]拒绝"],
        optionDescriptions: ["", "其他人将无法通过你的游戏ID搜索到你的成绩信息。"],
      },
      {
        key: "allowUserIdSearch",
        title: "用户ID搜索",
        current: "当前：[1]同意",
        selected: "[1]同意",
        description: "控制是否同意使用用户ID进行绑定，其他玩家可以通过用户id获取到你的成绩信息",
        options: ["[1]同意", "[0]拒绝"],
        optionDescriptions: ["", "禁止使用用户ID获取存档，将禁用用户ID绑定功能。"],
      },
    ] as const;
    const apiGroups = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.panel > .setting-group[data-setting-key][data-phi-setting-variant="api"]',
      ),
    );
    expect(text(root, '[data-phi-setting-variant="api"] .page-title')).toBe("Phi-Plugin API 用户设置");
    expect(text(root, '[data-phi-setting-variant="api"] .page-desc')).toBe("以下设置会同步到查分平台账户权限。");
    expect(apiGroups.map((group) => group.dataset.settingKey)).toEqual(
      apiExpected.map(({ key }) => key),
    );
    expect(root.querySelectorAll('[data-phi-setting-variant="api"] .option-card')).toHaveLength(10);
    expect(root.querySelectorAll('[data-phi-setting-variant="api"] .option-card.selected')).toHaveLength(apiExpected.length);
    for (const [index, group] of apiGroups.entries()) {
      const contract = apiExpected[index];
      const cards = directChildren(group.querySelector(".option-row")!, "option-card");
      expect(group.getAttribute("data-phi-selector")).toBe(`.setting-${contract.key}`);
      expect(text(group, ".setting-title")).toBe(contract.title);
      expect(text(group, ".setting-current")).toBe(contract.current);
      expect(text(group, ".setting-desc")).toBe(contract.description);
      expect(cards.map((card) => text(card, ".option-title"))).toEqual(contract.options);
      expect(cards.map((card) => text(card, ".option-desc"))).toEqual(contract.optionDescriptions);
      expect(cards.filter((card) => card.classList.contains("selected"))).toHaveLength(1);
      expect(text(cards.find((card) => card.classList.contains("selected"))!, ".option-title")).toBe(contract.selected);
    }

    expect(text(root, ".createdbox").replace(/\s+/g, "")).toBe("Phi-Pluginv1.0.2");
    expect(PAGE_DEFINITIONS["setting/userSetting"].height).toBe(1465);
  });

  it("renders all management settings with the runtime control kind", () => {
    const root = fixture("setting/setting");
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".box > .lineBox"));
    const fieldRows = Array.from(root.querySelectorAll<HTMLElement>(".box > .lineBox[data-field]"));
    const dividerRows = Array.from(root.querySelectorAll(".box > .lineBox.divider"));
    type ExpectedRow = [
      field: string,
      label: string,
      help: string,
      kind: string,
      value: string,
      unit: string,
    ];
    const expectedRows: ExpectedRow[] = [
      ["renderScale", "渲染精度", "对所有的图片生效，设置渲染精度", "space", "100", "%"],
      ["randerQuality", "渲染质量", "对所有的图片生效，设置渲染的质量", "space", "100", "%"],
      ["timeout", "渲染超时时间", "对所有的图片生效，超时后重启puppeteer，单位ms", "space", "20000", "ms"],
      ["waitingTimeout", "等待超时时间", "对所有的图片生效，单位ms", "space", "10000", "ms"],
      ["renderNum", "并行渲染数量", "并行数量越多，占用的资源越多，建议谨慎修改，修改后重启生效", "space", "1", ""],
      ["<divider>", "", "", "divider", "", ""],
      ["commentsAPage", "每页评论条数", "/song 每页评论最大渲染条数", "space", "10", ""],
      ["B19MaxNum", "B19最大限制", "用户可以获取B19图片成绩的最大数量，建议不要太大", "space", "50", ""],
      ["HistoryDayNum", "历史成绩单日数量", "/update 展现历史成绩的单日最大数量，至少为2", "space", "10", ""],
      ["HistoryScoreDate", "历史成绩展示天数", "/update 展现历史成绩的最大天数", "space", "10", ""],
      ["HistoryScoreNum", "历史成绩展示数量", "/update 展现历史成绩的最大数量", "space", "50", ""],
      ["listScoreMaxNum", "/list 最大数量", "/list 最大渲染成绩数量，建议为3的倍数", "space", "180", ""],
      ["<divider>", "", "", "divider", "", ""],
      ["WordB19Img", "文字版B19曲绘图片", "关闭可大幅度提升发送速度", "switch", "OFF", ""],
      ["WordSuggImg", "Suggest曲绘图片", "关闭可大幅度提升发送速度", "switch", "OFF", ""],
      ["defaultGlobal", "默认使用国际服", "开启后默认使用国际服查询，关闭后默认使用国服查询", "switch", "OFF", ""],
      ["onLinePhiIllUrl", "在线曲绘来源", "仅在未下载曲绘时有效，不影响下载曲绘指令。在线曲绘将重复下载曲绘资源，建议使用 /下载曲绘 将曲绘缓存到本地", "space", "GitHub raw", ""],
      ["githubProxy", "GitHub代理", "仅在在线曲绘来源为 GitHub raw 或下载曲绘源为 GitHub 时生效。填 false 为不使用代理，也可填写代理地址，如 https://gh-proxy.com", "space", "https://gh-proxy.com", ""],
      ["downIllUrl", "下载曲绘源", "下载曲绘的源，实时生效。选择 GitHub 时会使用上面的 GitHub代理配置", "space", "github", ""],
      ["watchInfoPath", "监听信息文件", "是否监听信息文件变化，如果机器人有自动更新插件功能建议开启，如遇监听文件数量超限请尝试关闭", "switch", "OFF", ""],
      ["allowComment", "曲目评论", "是否开启曲目评论功能，该功能目前暂无敏感词校验", "switch", "ON", ""],
      ["autoPullPhiIll", "自动更新曲绘", "开启后手动更新插件时自动更新曲绘文件", "switch", "OFF", ""],
      ["isGuild", "频道模式", "开启后文字版仅限私聊，关闭文字版图片，文字版将折叠为长消息", "switch", "OFF", ""],
      ["TapTapLoginQRcode", "绑定二维码", "登录TapTap绑定是否发送二维码，开启仅发送二维码，关闭直接发送链接", "switch", "ON", ""],
      ["cmdhead", "命令头", "命令正则匹配开头，不包含#/，支持正则表达式，'\\' 请双写( \\s --> \\\\s )，最外层可以不加括号", "space", "phi", ""],
      ["openPhiPluginApi", "联合查分", "是否启用Phigros联合查分API", "switch", "ON", ""],
      ["mutiNickWaitTimeOut", "多个曲目回复序号等待时长", "别名重复触发多个曲目选择时，等待回复序号的时长，单位：秒", "space", "10", ""],
      ["otherinfo", "曲库", "使用曲库的模式，若启用自定义则重名的以自定义为准", "space", "原版曲库", ""],
      ["GuessTipCd", "提示间隔", "猜曲绘的提示间隔时间，单位：秒", "space", "15", "s"],
      ["GuessTipRecall", "猜曲绘撤回", "是否在下一条提示发出的时候撤回上一条", "switch", "OFF", ""],
      ["LetterNum", "字母条数", "开字母的条数", "space", "8", ""],
      // This is the plugin's current runtime result: guoba uses `letterMarkdown`,
      // while the default config and game code use `LetterMarkdown`.
      ["letterMarkdown", "开字母发送MD消息", "开字母是否发送Markdown消息，开启发送Markdown消息，关闭直接发送文字版", "switch", "OFF", ""],
      ["LetterIllustration", "发送曲绘", "猜对后是否发送以及发送什么曲绘，水印版需要占用渲染资源，不发图片更快", "space", "水印版", ""],
      ["LetterRevealCd", "字母提示间隔", "开字母的全局开字母间隔时间，单位：秒", "space", "0", "s"],
      ["LetterGuessCd", "字母开启间隔", "开字母的全局开启间隔时间，单位：秒", "space", "0", "s"],
      ["LetterTipCd", "字母提示间隔", "开字母的全局提示间隔时间，单位：秒", "space", "0", "s"],
      ["LetterTimeLength", "猜字母待机时长", "无人回答多长时间后结束，单位：秒", "space", "300", "s"],
      ["GuessTipsTipCD", "提示冷却", "提示猜歌提示的冷却时间间隔，单位：秒", "space", "5", "s"],
      ["GuessTipsTipNum", "提示条数", "提示猜歌的提示条数（除曲绘外），若总提示条数小于设定条数则将会发送全部提示", "space", "6", ""],
      ["GuessTipsTimeout", "游戏时长", "提示猜歌超时时长，单位：秒", "space", "600", "s"],
      ["GuessTipsAnsTime", "额外时间", "发送曲绘后多久公布答案，单位：秒", "space", "30", "s"],
    ];

    expect(fieldRows).toHaveLength(39);
    expect(dividerRows).toHaveLength(2);
    expect(new Set(fieldRows.map((row) => row.dataset.field)).size).toBe(39);
    expect(rows.map((row): ExpectedRow => {
      const kind = row.dataset.kind || "divider";
      const value = kind === "switch"
        ? text(row, ".switchDrc-true, .switchDrc-false")
        : text(row, '[name="pvis"]');
      return [
        row.dataset.field || "<divider>",
        text(row, ".title"),
        text(row, ".info"),
        kind,
        value,
        text(row, ".drc"),
      ];
    })).toEqual(expectedRows);

    for (const row of fieldRows) {
      expect(text(row, ".title")).not.toBe("");
      expect(text(row, ".info")).not.toBe("");
      if (row.dataset.kind === "switch") {
        expect(row.querySelectorAll(".switch-true, .switch-false")).toHaveLength(1);
        expect(text(row, ".switchDrc-true, .switchDrc-false")).toMatch(/^(?:ON|OFF)$/);
        expect(row.querySelector('[name="pvis"]')).toBeNull();
      } else {
        expect(row.dataset.kind).toBe("space");
        expect(text(row, '[name="pvis"]')).not.toBe("");
        expect(row.querySelector(".switch-true, .switch-false")).toBeNull();
      }
    }

    expect(text(root, ".createdbox").replace(/\s+/g, "")).toBe("Phi-Pluginv1.0.2");
  });

  it("derives every difficulty-history mark from the plugin chart formula", () => {
    const root = fixture("difficultyHistory/difficultyHistory");
    const definition = PAGE_DEFINITIONS["difficultyHistory/difficultyHistory"];
    const histories = Array.from(root.querySelectorAll<HTMLElement>(".difficulty > .a-box"));
    const chartLines = Array.from(root.querySelectorAll<SVGPathElement>(".chart-line"));
    const svg = root.querySelector<SVGSVGElement>("#difficultyChart");
    const plot = root.querySelector<SVGGElement>(".chart-plot");
    expect(definition.width).toBe(2048);
    expect(definition.height).toBe(1031);
    expect(definition.baseCss).toMatch(/body\s*\{[^}]*width:\s*2048px;[^}]*height:\s*1031px/);
    expect(definition.baseCss).toMatch(/\.header\s*\{[^}]*width:\s*90%;[^}]*margin:\s*100px\s+5%/);
    expect(definition.baseCss).toMatch(/\.title-box\s*\{[^}]*justify-content:\s*flex-start/);
    expect(definition.baseCss).toMatch(/\.title-content\s*\{[^}]*width:\s*calc\(100%\s*-\s*5px\)/);
    expect(definition.baseCss).toMatch(/\.chart-container\s*\{[^}]*width:\s*800px;[^}]*height:\s*250px;[^}]*overflow:\s*visible/);
    expect(definition.baseCss).toMatch(/\.a-box\s*\{[^}]*box-sizing:\s*content-box/);
    expect(definition.baseCss).toMatch(/\.clip-box\s*\{[^}]*var\(--height\)\s*\*\s*\.3/);
    expect(definition.baseCss).toMatch(/\.dif-box\s*\{[^}]*--height:\s*50px/);
    expect(definition.baseCss).toMatch(/\.a-num\s*\{[^}]*--height:\s*70px/);
    expect(definition.baseCss).toMatch(/\.ver-box\s*\{[^}]*height:\s*70px/);
    expect(definition.baseCss).not.toMatch(/\.ver-box\s*\{[^}]*min-width\s*:/);
    expect(definition.baseCss).toMatch(/\.createdbox\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*center/);
    expect(definition.baseCss).toMatch(/\.createdbox p\s*\{[^}]*font-family:\s*"Aldrich",\s*"PHI"/);
    expect(root.querySelector(".background > img")?.getAttribute("src"))
      .toMatch(/\/demo\/difficulty-history-artwork\.png$/);
    expect(root.querySelector(".header > .ill-box img")?.getAttribute("src"))
      .toMatch(/\/demo\/difficulty-history-artwork\.png$/);
    expect(definition.baseCss).toMatch(/\.background img\s*\{[^}]*width:\s*auto;[^}]*height:\s*100%;[^}]*transform:\s*scale\(1\.2\);[^}]*filter:\s*blur\(20px\)\s+brightness\(50%\)/);
    expect(text(root, ".createdbox").replace(/\s+/g, "")).toBe("Phi-Pluginv1.0.2");
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
    const expectedCheckpoints = {
      "3.4.0@2023-12-12": { AT: 16.7, EZ: 7.5, HD: 12.9, IN: 15.9 },
      "3.5.0@2024-02-23": { HD: 13.5 },
      "3.9.0@2024-08-29": { EZ: 8.1 },
      "3.11.0@2025-02-14": { AT: 17.4, IN: 16.3 },
      "3.19.5@2026-07-30": { AT: 17.4, EZ: 8.1, HD: 13.5, IN: 16.3 },
    };

    expect(histories.map((history) => history.dataset.rank)).toEqual(["AT", "IN", "HD", "EZ"]);
    expect(chartLines.map((line) => line.dataset.rank)).toEqual(["EZ", "HD", "IN", "AT"]);
    expect(root.querySelectorAll(".difficulty .a-num")).toHaveLength(12);
    expect(root.querySelectorAll(".chart-series .chart-mark")).toHaveLength(12);
    expect(chartLines.every((line) => line.getAttribute("fill") === "none")).toBe(true);
    expect(definition.baseCss).toMatch(/\.chart-line\s*\{[^}]*\bfill:\s*none\s*;/);
    expect(definition.baseCss).toMatch(/\.chart-line,\s*\.chart-point\s*\{[^}]*\bstroke:\s*currentcolor\s*;/);
    expect(svg?.dataset.songId).toBe("DistortedFate.Sakuzyo");
    expect(svg?.dataset.scale).toBe("drawDifficultyChart");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 800 250");
    expect(svg?.getAttribute("width")).toBe("800");
    expect(svg?.getAttribute("height")).toBe("250");
    expect(plot?.getAttribute("transform")).toBe("translate(60 30)");
    expect([
      plot?.dataset.marginTop,
      plot?.dataset.marginRight,
      plot?.dataset.marginBottom,
      plot?.dataset.marginLeft,
    ]).toEqual(["30", "30", "50", "60"]);
    expect(text(root, ".title-content > .content p:first-child")).toBe("版本: v3.4.0");
    expect(text(root, ".title-content > .content p:last-child")).toBe("日期: 2023-12-12");

    const allPoints = Array.from(root.querySelectorAll<SVGCircleElement>(".chart-point"));
    const xValues = allPoints.map((point) => Number(point.dataset.x));
    const yValues = allPoints.map((point) => Number(point.dataset.difficulty));
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const xPadding = (xMax - xMin) * 0.1 || 1;
    const yPadding = (yMax - yMin) * 0.1 || 1;
    const innerWidth = 800 - 60 - 30;
    const innerHeight = 250 - 30 - 50;
    const scaleX = (value: number) =>
      ((value - (xMin - xPadding)) / (xMax + xPadding - (xMin - xPadding))) * innerWidth;
    const scaleY = (value: number) =>
      innerHeight -
      ((value - (yMin - yPadding)) / (yMax + yPadding - (yMin - yPadding))) * innerHeight;

    const xTicks = Array.from(root.querySelectorAll<SVGLineElement>(".chart-ticks-x > line"));
    const yTicks = Array.from(root.querySelectorAll<SVGLineElement>(".chart-ticks-y > line"));
    expect(xTicks.map((tick) => [
      Number(tick.getAttribute("x1")),
      Number(tick.getAttribute("y1")),
      Number(tick.getAttribute("x2")),
      Number(tick.getAttribute("y2")),
    ])).toEqual([0, 142, 284, 426, 568, 710].map((x) => [x, 170, x, 176]));
    expect(yTicks.map((tick) => [
      Number(tick.getAttribute("x1")),
      Number(tick.getAttribute("y1")),
      Number(tick.getAttribute("x2")),
      Number(tick.getAttribute("y2")),
    ])).toEqual([170, 136, 102, 68, 34, 0].map((y) => [-6, y, 0, y]));
    expect(root.querySelectorAll(".chart-guide-x")).toHaveLength(allPoints.length);
    expect(root.querySelectorAll(".chart-guide-y")).toHaveLength(allPoints.length);
    expect(root.querySelectorAll(".chart-label-x")).toHaveLength(allPoints.length);
    expect(root.querySelectorAll(".chart-label-y")).toHaveLength(allPoints.length);

    const actualCheckpoints: Record<string, Record<string, number>> = {};

    for (const history of histories) {
      const rank = history.dataset.rank;
      const line = chartLines.find((candidate) => candidate.dataset.rank === rank);
      expect(line, `${rank} chart line`).toBeDefined();
      expect(rank, "history rank").toBeDefined();

      const series = (line!.dataset.values || "")
        .split("|")
        .map((entry) => {
          const [versionDate, rawValue] = entry.split("=");
          const [version, date] = versionDate?.split("@") || [];
          return { date, value: Number(rawValue), version };
        });
      const historySeries = Array.from(history.querySelectorAll<HTMLElement>(".a-num"), (node) => ({
        date: node.dataset.date || "",
        difficulty: Number(node.dataset.difficulty),
        version: node.dataset.version || "",
        x: Number(node.dataset.x),
      }));
      const visibleSeries = Array.from(history.querySelectorAll<HTMLElement>(".a-num"), (node) => ({
        date: text(node, ".update-date p"),
        difficulty: text(node, ".num-box p"),
        version: text(node, ".update-ver p"),
      }));
      const circles = Array.from(root.querySelectorAll<SVGCircleElement>(
        `.chart-series[data-rank="${rank}"] .chart-point`,
      ));
      const points = circles.map((circle) => [
        Number(circle.getAttribute("cx")),
        Number(circle.getAttribute("cy")),
      ] as [number, number]);
      const pathPoints = line!.getAttribute("d")?.match(/[-+]?\d*\.?\d+/g)?.map(Number) || [];

      expect(historySeries).toEqual(expectedHistory[rank!]);
      expect(visibleSeries).toEqual(expectedHistory[rank!].map(({ date, difficulty, version }) => ({
        date,
        difficulty: difficulty.toFixed(1),
        version: `v${version}`,
      })));
      expect(series).toEqual(expectedHistory[rank!].map(({ date, difficulty, version }) => ({
        date,
        value: difficulty,
        version,
      })));
      expect(points).toHaveLength(series.length);
      expect(circles.map((circle) => Number(circle.dataset.difficulty)))
        .toEqual(series.map(({ value }) => value));
      expect(pathPoints).toHaveLength(series.length * 2);
      expect(line!.getAttribute("d")).toMatch(/^M\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+(?:\s+L\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+)+$/);
      expect(line!.getAttribute("d")).not.toMatch(/[zZ]/);
      for (let index = 0; index < points.length; index += 1) {
        expect(points[index][0]).toBeCloseTo(pathPoints[index * 2], 5);
        expect(points[index][1]).toBeCloseTo(pathPoints[index * 2 + 1], 5);
      }
      expect(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
      expect(points.slice(1).every(([x], index) => x < points[index][0])).toBe(true);

      for (const { date, difficulty, version } of historySeries) {
        const checkpoint = `${version}@${date}`;
        actualCheckpoints[checkpoint] ||= {};
        actualCheckpoints[checkpoint][rank!] = difficulty;
      }
    }

    expect(actualCheckpoints).toEqual(expectedCheckpoints);

    for (const point of allPoints) {
      const cx = Number(point.getAttribute("cx"));
      const cy = Number(point.getAttribute("cy"));
      const expectedX = scaleX(Number(point.dataset.x));
      const expectedY = scaleY(Number(point.dataset.difficulty));
      const mark = point.closest<SVGGElement>(".chart-mark");
      const xGuide = mark?.querySelector<SVGLineElement>(".chart-guide-x");
      const yGuide = mark?.querySelector<SVGLineElement>(".chart-guide-y");
      const dateParts = new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Shanghai",
        year: "numeric",
      }).formatToParts(Number(point.dataset.x) * 1000);
      const datePart = (type: Intl.DateTimeFormatPartTypes) =>
        dateParts.find((part) => part.type === type)?.value;
      const formattedDate = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;

      expect(formattedDate).toBe(point.dataset.date);
      expect(cx, `${point.dataset.rank} ${point.dataset.version} x`).toBeCloseTo(expectedX, 5);
      expect(cy, `${point.dataset.rank} ${point.dataset.version} y`).toBeCloseTo(expectedY, 5);
      expect(Number(xGuide?.getAttribute("x1"))).toBeCloseTo(cx, 5);
      expect(Number(xGuide?.getAttribute("y1"))).toBeCloseTo(cy, 5);
      expect(Number(xGuide?.getAttribute("x2"))).toBeCloseTo(cx, 5);
      expect(Number(xGuide?.getAttribute("y2"))).toBe(innerHeight);
      expect(Number(yGuide?.getAttribute("x1"))).toBeCloseTo(cx, 5);
      expect(Number(yGuide?.getAttribute("y1"))).toBeCloseTo(cy, 5);
      expect(Number(yGuide?.getAttribute("x2"))).toBe(0);
      expect(Number(yGuide?.getAttribute("y2"))).toBeCloseTo(cy, 5);
      expect(mark?.querySelector(".chart-label-x")?.textContent).toBe(`v${point.dataset.version}`);
      expect(mark?.querySelector(".chart-label-y")?.textContent)
        .toBe(Number(point.dataset.difficulty).toFixed(1));
    }
  });

  it("keeps all 77 help commands in their eight source groups", () => {
    const root = fixture("help/help");
    const groups = Array.from(root.querySelectorAll(".help_box"));
    const expectedGroups = [
      ["——·绑定·——", 3],
      ["——·查询 & 统计·——", 16],
      ["——·图鉴 & 功能·——", 17],
      ["——·别名提案·——", 6],
      ["——·API 操作·——", 7],
      ["——·娱乐 & 设定·——", 10],
      ["——·反馈 & 提议·——", 3],
      ["——·管理员命令·——", 15],
    ] as const;

    expect(groups).toHaveLength(expectedGroups.length);
    expect(groups.map((group) => [
      text(group, ".help-group"),
      directChildren(group, "line").length,
    ])).toEqual(expectedGroups);
    expect(root.querySelectorAll(".help_box > .line")).toHaveLength(77);

    for (const [groupIndex, group] of groups.entries()) {
      const rows = directChildren(group, "line");
      expect(rows.map((row) => text(row, ".num")))
        .toEqual(rows.map((_, index) => String(index + 1)));
      expect(rows.every((row) => text(row, ".order") !== "")).toBe(true);
      expect(rows.every((row) => text(row, ".song") !== "")).toBe(true);
      expect(rows.every((row) => text(row, ".desc") !== "")).toBe(true);
      expect(rows.length, `help group ${groupIndex + 1}`).toBe(expectedGroups[groupIndex][1]);
    }

    expect(groups[0].querySelectorAll(":scope > .line")[0].querySelector(".order")?.textContent?.trim())
      .toBe("/phi bind");
    expect(text(groups[1], ":scope > .line:last-child .order")).toBe("/phi data");
    expect(text(groups[2], ":scope > .line:last-child .order")).toBe("/phi tips");
    expect(text(groups[7], ":scope > .line:last-child .order")).toBe("/phi updateComment");
    expect(Array.from(root.querySelectorAll<HTMLImageElement>(".desc img"), (image) =>
      image.getAttribute("src"))).toEqual([
      "/demo/helpDoc.png",
      "/demo/nickSuggest.png",
      "/demo/callback.png",
    ]);
    expect(text(root, ".createdbox").replace(/\s+/g, "")).toBe("Phi-Pluginv1.0.2");
    expect(PAGE_DEFINITIONS["help/help"]).toMatchObject({ width: 1200, height: 4237 });
  });

  it("matches the complete sign-in player, task, and August calendar fixture", () => {
    const root = fixture("sign/sign");
    const tasks = Array.from(root.querySelectorAll(".dailySongsPanel > .songItem"));
    const expectedTasks = [
      ["01", "千紫万紅", "EZ 4.5 · ACC 6.16 · +20 Notes"],
      ["02", "Luminescent", "IN 14.4 · ACC 39.42 · +20 Notes"],
      ["03", "Freaky Undulations ~Noble Knights of Tune~", "IN 15.3 · ACC 99.72 · +35 Notes"],
      ["04", "DevIAtIoN (short ver.)", "IN 15.7 · ACC 95.42 · +2 Notes"],
      ["05", "BANGING STRIKE", "AT 16.8 · ACC 99.36 · +35 Notes"],
    ];

    expect(text(root, ".playerId")).toBe("lyh");
    expect(text(root, ".rks")).toBe("16.1340");
    expect(text(root, ".clgBox .Challenge p")).toBe("48");
    expect(text(root, ".dataBox")).toBe("71 Notes");
    expect(text(root, ".spInfo")).toBe("累计签到 5 天");
    expect(text(root, ".luckValue")).toBe("80");
    expect(Array.from(root.querySelectorAll(".wordsBox"), (box) =>
      Array.from(box.querySelectorAll("p"), (item) => item.textContent?.trim())))
      .toEqual([
        ["宜", "练底力", "自转", "吃废酱", "吃番茄"],
        ["忌", "吃胡桃", "开黑", "爬梯", "2085"],
      ]);
    expect(text(root, ".quoteText"))
      .toBe("在和平年代中，儿子埋葬父亲，但在战争中，父亲埋葬儿子。");
    expect(tasks.map((task) => [
      text(task, ".songIndex"),
      text(task, ".songName"),
      text(task, ".songMeta"),
    ])).toEqual(expectedTasks);
    expect(tasks.every((task) => task.querySelector(".songCover img"))).toBe(true);

    const cells = Array.from(root.querySelectorAll(".calendarCell"));
    const days = cells.filter((cell) => !cell.classList.contains("empty"));
    expect(cells).toHaveLength(42);
    expect(days.map((day) => text(day, "span")))
      .toEqual(Array.from({ length: 31 }, (_, index) => String(index + 1)));
    expect(Array.from(root.querySelectorAll(".calendarCell.signed"), (day) => text(day, "span")))
      .toEqual(["9", "14", "16"]);
    expect(Array.from(root.querySelectorAll(".calendarCell.today"), (day) => text(day, "span")))
      .toEqual(["16"]);
    expect(root.querySelector(".calendarCell.today")?.classList).toContain("signed");
    expect(text(root, ".calendarTitle")).toBe("2026 年 8 月");
    expect(PAGE_DEFINITIONS["sign/sign"]).toMatchObject({ width: 2048, height: 1080 });
  });

  it("matches all three challenge charts and their note totals", () => {
    const root = fixture("clg/clg");
    const cards = Array.from(root.querySelectorAll(".box > .song-box"));
    const actual = cards.map((card) => ({
      difficulty: Array.from(card.querySelectorAll(":scope > .dif p"), (node) =>
        node.textContent?.trim()),
      labels: Array.from(card.querySelectorAll(".notes_title"), (node) => node.textContent?.trim()),
      name: text(card, ".song_name"),
      notes: Array.from(card.querySelectorAll(".notes_num"), (node) => node.textContent?.trim()),
    }));

    expect(actual).toEqual([
      {
        name: "Snow Desert",
        difficulty: ["IN", "13.4"],
        labels: ["Tap", "Drag", "Hold", "Flick", "Combo"],
        notes: ["319", "243", "68", "25", "655"],
      },
      {
        name: "Bloom",
        difficulty: ["EZ", "3.5"],
        labels: ["Tap", "Drag", "Hold", "Flick", "Combo"],
        notes: ["57", "72", "16", "38", "183"],
      },
      {
        name: "光",
        difficulty: ["HD", "7.5"],
        labels: ["Tap", "Drag", "Hold", "Flick", "Combo"],
        notes: ["232", "54", "11", "18", "315"],
      },
    ]);
    expect(text(root, ".tot_clg")).toBe("23");
    expect(cards.every((card) => card.querySelector(".ill > img"))).toBe(true);
    expect(cards.every((card) => card.querySelector(".ill-shadow"))).toBe(true);
    expect(text(root, ".createdbox").replace(/\s+/g, "")).toBe("Phi-Pluginv1.0.2");
    expect(PAGE_DEFINITIONS["clg/clg"]).toMatchObject({ width: 1920, height: 1200 });
  });

  it("uses the real 60-segment RKS curve and complete update records", () => {
    const root = fixture("update/update");
    const definition = PAGE_DEFINITIONS["update/update"];
    const summary = Array.from(root.querySelectorAll(".title > .r > p"), (node) =>
      node.textContent?.trim());
    expect(summary).toEqual([
      "Player: lyh",
      "RankingScore: 16.1340",
      "Notes: 71",
      "Date: 2026/08/16 13:54:49",
    ]);
    expect(text(root, ".Challenge-r p")).toBe("48");
    expect(Array.from(root.querySelectorAll(".value_box p"), (node) => node.textContent?.trim()))
      .toEqual(["16.1340", "15.1275"]);
    expect(Array.from(root.querySelectorAll(".date_box p"), (node) => node.textContent?.trim()))
      .toEqual(["2025/12/19 20:44:48", "2026/08/16 12:07:50"]);

    const segments = Array.from(root.querySelectorAll<SVGLineElement>(".line > svg > line"));
    const coordinateStream = segments.map((segment) =>
      ["x1", "y1", "x2", "y2"].map((attribute) => segment.getAttribute(attribute)).join(","),
    ).join("|");
    expect(segments).toHaveLength(60);
    // Exact coordinate stream emitted by saveHistory.getRksLine() for this runtime fixture.
    // This catches a plausible-looking replacement curve, not only missing SVG elements.
    expect(createHash("sha256").update(coordinateStream).digest("hex"))
      .toBe("b72eeaee0fb2a00f62a968877c6ca5a211da038d9560806e1789912a55063bca");
    expect([segments[0].getAttribute("x1"), segments[0].getAttribute("y1")])
      .toEqual(["0%", "0%"]);
    expect([segments.at(-1)?.getAttribute("x2"), segments.at(-1)?.getAttribute("y2")])
      .toEqual(["100%", "100%"]);
    expect(["x1", "y1", "x2", "y2"].map((attribute) => segments[8].getAttribute(attribute)))
      .toEqual([
        "35.50058521224073%",
        "69.16473451968895%",
        "38.70847022103195%",
        "66.1840326173572%",
      ]);
    expect(segments.filter((segment) =>
      segment.getAttribute("x1") === segment.getAttribute("x2")
      && segment.getAttribute("y1") === segment.getAttribute("y2"),
    )).toHaveLength(4);
    for (const [index, segment] of segments.entries()) {
      const values = ["x1", "y1", "x2", "y2"].map((attribute) =>
        Number(segment.getAttribute(attribute)?.replace("%", "")));
      expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100))
        .toBe(true);
      expect(values[2]).toBeGreaterThanOrEqual(values[0]);
      if (index < segments.length - 1) {
        expect(segment.getAttribute("x2")).toBe(segments[index + 1].getAttribute("x1"));
        expect(segment.getAttribute("y2")).toBe(segments[index + 1].getAttribute("y1"));
      }
    }
    expect(definition.baseCss).toMatch(/\.line\s+svg\s*\{[^}]*transform:\s*scaleY\(-1\)/);

    const songBoxes = Array.from(root.querySelectorAll(".record_box > .song_box"));
    const taskCards = directChildren(songBoxes[0], "abox");
    expect(taskCards.map((card) => [
      text(card, ".songsname"),
      text(card, ".coinbox_un"),
      text(card, ".rank"),
      text(card, ".score"),
    ])).toEqual([
      ["千紫万紅", "+20 Notes", "ACC", "6.16%"],
      ["Luminescent", "+20 Notes", "ACC", "39.42%"],
      ["Freaky Undulations ~Noble Knights of Tune~", "+35 Notes", "ACC", "99.72%"],
      ["DevIAtIoN (short ver.)", "+2 Notes", "ACC", "95.42%"],
      ["BANGING STRIKE", "+35 Notes", "ACC", "99.36%"],
    ]);

    const historyCards = songBoxes.slice(1).flatMap((box) => directChildren(box, "abox"));
    expect(historyCards.map((card) => [
      text(card, ".songsname"),
      card.querySelector<HTMLImageElement>(".new-box img")?.getAttribute("alt"),
      text(card, ".rank"),
      text(card, ".score"),
      text(card, ".acc").replace(/\s+/g, ""),
      text(card, ".rks"),
    ])).toEqual([
      ["+ERABY+E CONNEC+10N", "S", "AT", "928439", "98.0652%", "15.8443"],
      ["AbsoluTe disoRdeR", "S", "AT", "933837", "98.8568%", "16.3372"],
      ["Cthugha", "V", "AT", "999346", "99.9273%", "16.0480"],
      ["Ποσειδών", "V", "AT", "985489", "99.4748%", "15.8241"],
      ["ATHAZA", "V", "AT", "972675", "99.5685%", "16.2832"],
      ["sølips", "A", "IN", "904162", "96.5027%", "13.6097"],
      ["AbsoluTe disoRdeR", "S", "AT", "925385", "98.8568%", "16.3372"],
      ["Fractured Angel", "V", "IN", "997675", "99.7417%", "16.1134"],
      ["KIZUNA Resolution", "S", "IN", "955756", "98.2387%", "15.1413"],
      ["Stardust:RAY", "A", "AT", "884389", "96.4586%", "14.5993"],
      ["AbsoluTe disoRdeR", "A", "AT", "898309", "97.9605%", "15.6762"],
      ["祈 -我ら神祖と共に歩む者なり-", "V", "IN", "975806", "99.7255%", "16.2005"],
      ["Retribution ~ Cycle of Redemption ~", "S", "IN", "935496", "99.2244%", "15.6464"],
      ["彩", "V", "IN", "979760", "99.6178%", "16.1226"],
      ["Spasmodic", "S", "AT", "939237", "99.2280%", "16.1319"],
      ["CROSS†SOUL", "S", "IN", "954598", "99.0421%", "15.7092"],
      ["Disorder", "A", "IN", "919608", "98.2571%", "13.6758"],
      ["Infinity Heaven", "S", "IN", "943324", "98.7561%", "13.1422"],
    ]);
    expect(taskCards).toHaveLength(5);
    expect(historyCards).toHaveLength(18);
    expect(root.querySelector(".Nosignal")?.hasAttribute("hidden")).toBe(true);
    expect(definition).toMatchObject({ width: 800, height: 931 });
    expect(definition.baseCss).toMatch(
      /\.history-title\s+\.box_title-left p\s*\{[^}]*white-space:\s*nowrap;[^}]*font-size:\s*10px/,
    );
  });
});
