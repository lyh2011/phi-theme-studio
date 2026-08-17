// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PREVIEW_MARKUP } from "./preview";

const EXPECTED_ARTWORK = [
  ["BANGING STRIKE", "ill-BANGINGSTRIKE_DewPleiades-da5d4e74a8.webp"],
  ["蝎虎天体 -Lacertid-", "ill-Lacertid_CreamvsDaily-cdb4419018.webp"],
  ["星拂云锦 feat. koi", "ill-featkoi_S9ryne-e437c60b2c.webp"],
  ["DESTRUCTION 3,2,1", "ill-DESTRUCTION321_Normal1zervsBrokenNerdz-0dcfe2bb06.webp"],
  ["Stasis", "ill-Stasis_Maozon-7cc480c09f.webp"],
  ["祈 -我ら神祖と共に歩む者なり-", "ill--_-_VS_VSKaiVS_VS-2f6a40e8a2.webp"],
  ["Re：End of a Dream", "ill-ReEndofaDream_umavs-8e8c553dc4.webp"],
  ["Distorted Fate", "ill-DistortedFate_Sakuzyo-843f17a871.webp"],
  ["Lyrith -迷宮リリス-", "ill-Lyrith-812c00b2ee.webp"],
  ["AbsoluTe disoRdeR", "ill-AbsoluTedisoRdeR_AcuteDisarray-ee4743086a.webp"],
  ["BANGING STRIKE", "low-BANGINGSTRIKE_DewPleiades-7f61c09517.webp"],
  ["ATHAZA", "ill-ATHAZA_LeaF-4cc579be5e.webp"],
  ["祈 -我ら神祖と共に歩む者なり-", "low--_-_VS_VSKaiVS_VS-2b65809fea.webp"],
  ["Ad astra per aspera", "ill-Adastraperaspera_RabbitHouse-c041d57d3d.webp"],
  ["幻影鬼魅 (PLEASE)", "ill-PLEASE_R300K-58056e2115.webp"],
  ["Spasmodic", "ill-Spasmodic-672d9c0126.webp"],
  ["彩", "ill-MisoilePunch-41952f5ca5.webp"],
  ["PRAGMATISM -RESURRECTION-", "ill-PRAGMATISMRESURRECTION_Laur-78e98aa291.webp"],
  ["夢の降る日に", "ill-seatrus-a9b13bd035.webp"],
  ["Fractured Angel", "ill-FracturedAngel_DJRaisei-be1b016a4f.webp"],
  ["Distorted Fate", "low-DistortedFate_Sakuzyo-10027a8230.webp"],
  ["Avataar ~Reincarnation of Kalpa~", "ill-AvataarReincarnationofKalpa_ScarletteakaCrYmson-1c144e7044.webp"],
  ["70 Minutes Fighters", "ill-70MinutesFighters-cf17174890.webp"],
  ["Cthugha", "ill-Cthugha_USAO-b4825bb0eb.webp"],
  ["Bounded Quietude", "ill-BoundedQuietude_FiniteLimitvsSiLiS-3eb9deba09.webp"],
  ["NO x", "ill-NOx_Juggernaut-c72229ef82.webp"],
  ["Incyde", "ill-Incyde_YbeLL-da5432d6b4.webp"],
  ["Rrhar'il", "ill-Rrharil_TeamGrimoire-fbdeaeaf28.webp"],
  ["AbsoluTe disoRdeR", "low-AbsoluTedisoRdeR_AcuteDisarray-354a18d309.webp"],
  ["零號車輛", "ill-seatrus-0786316b26.webp"],
  ["BANGING STRIKE", "low-BANGINGSTRIKE_DewPleiades-7f61c09517.webp"],
  ["明鏡烈火", "ill-MUEvsRekuMochizuki-114a11ca73.webp"],
  ["+ERABY+E CONNEC+10N", "ill-ERABYECONNEC10N-9fb8589597.webp"],
  ["PRAGMATISM -RESURRECTION-", "low-PRAGMATISMRESURRECTION_Laur-017bc77509.webp"],
  ["DESTRUCTION 3,2,1", "low-DESTRUCTION321_Normal1zervsBrokenNerdz-d9791b5d51.webp"],
  ["QZKago Requiem", "low-QZKagoRequiem_tpazolite-6eec5def52.webp"],
] as const;

describe("score artwork fixture", () => {
  it("binds each exported title to its canonical local artwork", () => {
    document.body.innerHTML = PREVIEW_MARKUP;
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-phi-role="song-card"]',
      ),
    ];

    expect(cards).toHaveLength(36);
    const actual = cards.map((card) => {
      const title = card.querySelector(".songname p")?.textContent ?? "";
      const image = card.querySelector<HTMLImageElement>(".ill img");
      const cover =
        image?.getAttribute("src")?.match(/song-covers\/([^/]+\.webp)$/)?.[1] ??
        "";

      expect(image?.alt).toBe(title);
      expect(existsSync(resolve("public/demo/song-covers", cover))).toBe(true);
      return [title, cover];
    });

    expect(actual).toEqual(EXPECTED_ARTWORK);
    expect(new Set(actual.map(([, cover]) => cover)).size).toBeGreaterThanOrEqual(
      30,
    );
  });
});
