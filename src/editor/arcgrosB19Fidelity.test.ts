// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DEFINITIONS } from "./pageRegistry";

type ArcCard = readonly [
  key: string,
  title: string,
  artwork: string,
  rank: "AT" | "IN",
  difficulty: string,
  rks: string,
  score: string,
  acc: string,
  rating: "phi" | "FC" | "V" | "S",
];

// Locked to the supplied Arcaea B30 reference image, in visual row order.
const REFERENCE_CARDS: readonly ArcCard[] = [
  ["P1", "BANGING STRIKE", "arc-ill-BANGINGSTRIKE_DewPleiades-da5d4e74a8.png", "IN", "15.9", "15.90", "1'000'000", "100.0000", "phi"],
  ["P2", "蝎虎天体 -Lacertid-", "arc-ill-Lacertid_CreamvsDaily-cdb4419018.png", "IN", "15.5", "15.50", "1'000'000", "100.0000", "phi"],
  ["P3", "星拂云锦 feat. koi", "arc-ill-featkoi_S9ryne-e437c60b2c.png", "IN", "15.5", "15.50", "1'000'000", "100.0000", "phi"],
  ["#1", "DESTRUCTION 3,2,1", "arc-ill-DESTRUCTION321_Normal1zervsBrokenNerdz-0dcfe2bb06.png", "AT", "17.3", "16.79", "0'957'285", "99.3348", "S"],
  ["#2", "Stasis", "arc-ill-Stasis_Maozon-7cc480c09f.png", "AT", "16.7", "16.55", "0'981'768", "99.7971", "V"],
  ["#3", "祈 -我ら神祖と共に歩む者なり-", "arc-ill--_-_VS_VSKaiVS_VS-2f6a40e8a2.png", "AT", "17.3", "16.48", "0'930'644", "98.9154", "S"],
  ["#4", "Re：End of a Dream", "arc-ill-ReEndofaDream_umavs-8e8c553dc4.png", "AT", "16.9", "16.40", "0'974'630", "99.3282", "V"],
  ["#5", "Distorted Fate", "arc-ill-DistortedFate_Sakuzyo-843f17a871.png", "AT", "17.4", "16.39", "0'946'871", "98.6711", "S"],
  ["#6", "Lyrith -迷宮リリス-", "arc-ill-Lyrith-812c00b2ee.png", "AT", "16.5", "16.38", "0'998'471", "99.8301", "FC"],
  ["#7", "AbsoluTe disoRdeR", "arc-ill-AbsoluTedisoRdeR_AcuteDisarray-ee4743086a.png", "AT", "17.2", "16.34", "0'933'837", "98.8568", "S"],
  ["#8", "BANGING STRIKE", "arc-ill-BANGINGSTRIKE_DewPleiades-da5d4e74a8.png", "AT", "16.8", "16.31", "0'970'373", "99.3321", "V"],
  ["#9", "ATHAZA", "arc-ill-ATHAZA_LeaF-4cc579be5e.png", "AT", "16.6", "16.28", "0'972'675", "99.5685", "V"],
  ["#10", "祈 -我ら神祖と共に歩む者なり-", "arc-ill--_-_VS_VSKaiVS_VS-2f6a40e8a2.png", "IN", "16.4", "16.20", "0'975'806", "99.7255", "V"],
  ["#11", "Ad astra per aspera", "arc-ill-Adastraperaspera_RabbitHouse-c041d57d3d.png", "IN", "16.3", "16.15", "0'964'742", "99.7902", "V"],
  ["#12", "幻影鬼魅 (PLEASE)", "arc-ill-PLEASE_R300K-58056e2115.png", "AT", "17.0", "16.13", "0'943'956", "98.8384", "S"],
  ["#13", "Spasmodic", "arc-ill-Spasmodic-672d9c0126.png", "AT", "16.7", "16.13", "0'939'237", "99.2280", "S"],
  ["#14", "彩", "arc-ill-MisoilePunch-41952f5ca5.png", "IN", "16.4", "16.12", "0'979'760", "99.6178", "V"],
  ["#15", "PRAGMATISM -RESURRECTION-", "arc-ill-PRAGMATISMRESURRECTION_Laur-78e98aa291.png", "AT", "16.6", "16.12", "0'990'826", "99.3426", "V"],
  ["#16", "夢の降る日に", "arc-ill-seatrus-a9b13bd035.png", "IN", "16.6", "16.11", "0'953'536", "99.3363", "S"],
  ["#17", "Fractured Angel", "arc-ill-FracturedAngel_DJRaisei-be1b016a4f.png", "IN", "16.3", "16.11", "0'997'675", "99.7417", "FC"],
  ["#18", "Distorted Fate", "arc-ill-DistortedFate_Sakuzyo-843f17a871.png", "IN", "16.3", "16.11", "0'997'609", "99.7343", "FC"],
  ["#19", "Avataar ~Reincarnation of Kalpa~", "arc-ill-AvataarReincarnationofKalpa_ScarletteakaCrYmson-1c144e7044.png", "AT", "16.6", "16.08", "0'977'803", "99.2924", "V"],
  ["#20", "70 Minutes Fighters", "arc-ill-70MinutesFighters-cf17174890.png", "IN", "16.5", "16.08", "0'943'552", "99.4252", "S"],
  ["#21", "Cthugha", "arc-ill-Cthugha_USAO-b4825bb0eb.png", "AT", "16.1", "16.05", "0'999'346", "99.9273", "FC"],
  ["#22", "Bounded Quietude", "arc-ill-BoundedQuietude_FiniteLimitvsSiLiS-3eb9deba09.png", "IN", "16.2", "16.03", "0'996'571", "99.7628", "FC"],
  ["#23", "NO x", "arc-ill-NOx_Juggernaut-c72229ef82.png", "IN", "16.1", "15.99", "0'998'630", "99.8478", "FC"],
  ["#24", "Incyde", "arc-ill-Incyde_YbeLL-da5432d6b4.png", "IN", "16.2", "15.99", "0'972'357", "99.7087", "V"],
  ["#25", "Rrhar'il", "arc-ill-Rrharil_TeamGrimoire-fbdeaeaf28.png", "IN", "16.1", "15.98", "0'998'546", "99.8385", "FC"],
  ["#26", "AbsoluTe disoRdeR", "arc-ill-AbsoluTedisoRdeR_AcuteDisarray-ee4743086a.png", "IN", "16.3", "15.91", "0'978'284", "99.4625", "V"],
  ["#27", "零號車輛", "arc-ill-seatrus-0786316b26.png", "IN", "16.2", "15.90", "0'977'649", "99.5847", "V"],
  ["#28", "BANGING STRIKE", "arc-ill-BANGINGSTRIKE_DewPleiades-da5d4e74a8.png", "IN", "15.9", "15.90", "1'000'000", "100.0000", "phi"],
  ["#29", "明鏡烈火", "arc-ill-MUEvsRekuMochizuki-114a11ca73.png", "IN", "15.9", "15.87", "0'999'645", "99.9605", "FC"],
  ["#30", "+ERABY+E CONNEC+10N", "arc-ill-ERABYECONNEC10N-9fb8589597.png", "IN", "16.3", "15.87", "0'958'941", "99.3987", "S"],
];

// These assets were checked against the illustration crops in arcb30.jpg.
// Locking their bytes catches a swapped cover even when its filename and alt
// text still claim the expected song.
const REFERENCE_ARTWORK_SHA256: Readonly<Record<string, string>> = {
  "arc-ill--_-_VS_VSKaiVS_VS-2f6a40e8a2.png": "eeb8dc2c7d38c205548dbcbadebfd555aad46f67c498bdbb862f263ce551681d",
  "arc-ill-70MinutesFighters-cf17174890.png": "129b8903660de4c52ce0e5778bac1d0f817c9976bd09aeea576d9a122c2c7aad",
  "arc-ill-ATHAZA_LeaF-4cc579be5e.png": "383e906169470e709b0d403928219503df2aa180da70583b192683fa6ab916be",
  "arc-ill-AbsoluTedisoRdeR_AcuteDisarray-ee4743086a.png": "907e6a4d45abbd6aa5f316e09429891e2ea0881f0617665ef1d493c083b9a21f",
  "arc-ill-Adastraperaspera_RabbitHouse-c041d57d3d.png": "91010f34b8b54ea71c6a45581d1e1eaf8f6c1fcb7f3eb35e405150211342768d",
  "arc-ill-AvataarReincarnationofKalpa_ScarletteakaCrYmson-1c144e7044.png": "dd38a09ee4d1c4e04acd72d901777b1071a4cc8450c10cbd517d43666ef73507",
  "arc-ill-BANGINGSTRIKE_DewPleiades-da5d4e74a8.png": "7672637ef95fa67f0edcf66cd2b3a896829887f83a113383bdb74ca5214b8c89",
  "arc-ill-BoundedQuietude_FiniteLimitvsSiLiS-3eb9deba09.png": "cb5fe153f2fc0d014699dc00963a230485403a49317edd8ced4dbfb6f513c46e",
  "arc-ill-Cthugha_USAO-b4825bb0eb.png": "8a8eb862a3fa586502edc2895db9e7a3b0adedee0ceae9f6f54c5255c916824e",
  "arc-ill-DESTRUCTION321_Normal1zervsBrokenNerdz-0dcfe2bb06.png": "cdcac485cd38928b4135b208564c7d83ffc4d38672a77831ca3fec3e2dd99427",
  "arc-ill-DistortedFate_Sakuzyo-843f17a871.png": "42d7c1efb6d308cc50d35aa455f5f34dbfef290c4bf8d994c0da83d35641182a",
  "arc-ill-ERABYECONNEC10N-9fb8589597.png": "27407ab9814c581d56d9fd4ec8fb69e560c36ee20b0e5c7f317dac388bdd2fcb",
  "arc-ill-FracturedAngel_DJRaisei-be1b016a4f.png": "ea1833e68c2d1e19109aabd8737e44f728ca678c047b4cd4d1c111c5902fb4b9",
  "arc-ill-Incyde_YbeLL-da5432d6b4.png": "1f78f79b2a2b316c34f7a99678f7d1e5e348be6559c690ac3e37ccfb8fded94e",
  "arc-ill-Lacertid_CreamvsDaily-cdb4419018.png": "f5c62272b5fbac42a8a1e0fad2bc9e3edbafbda2512f49311730789743167195",
  "arc-ill-Lyrith-812c00b2ee.png": "d5b8d682f3bc90ab2f045d02aff284e4867a4242e317c632224815180e2d7427",
  "arc-ill-MUEvsRekuMochizuki-114a11ca73.png": "df5648acd167107bddf0a49544ed16fd67038469774dcef71ce7689c97dcef05",
  "arc-ill-MisoilePunch-41952f5ca5.png": "e7365459c5332c1b2748e76558131ebbb0287d3a83f49f7e88e7b68b7cbe27dd",
  "arc-ill-NOx_Juggernaut-c72229ef82.png": "e1c575afcb2642934f06356c634a49507d425087267431c8a60554519e18f9ae",
  "arc-ill-PLEASE_R300K-58056e2115.png": "7cefb315f5df689aa8cf368a4bcfe0dfda8684f020c6963c94c8385c00c017ee",
  "arc-ill-PRAGMATISMRESURRECTION_Laur-78e98aa291.png": "d378c400fa3ebe7d4380afed878872916f1d0f897e3f02bfad27229e52ef14bf",
  "arc-ill-ReEndofaDream_umavs-8e8c553dc4.png": "48a9b35ce2c10d34853c0ce6f8176334f9545782e94c572de5bfd06c6b8fdd44",
  "arc-ill-Rrharil_TeamGrimoire-fbdeaeaf28.png": "fed19c8b8b6158b5f56247dbee5db00e9644a4b8d49f606131d7f49308b6cf34",
  "arc-ill-Spasmodic-672d9c0126.png": "b622e5fdba15e56adb92d87de1d942fd5cc936141e25a901b29d3b3ff0dcd5ef",
  "arc-ill-Stasis_Maozon-7cc480c09f.png": "7ae08cee2250bc8e8af8b1650fff691d286e0248e82b7608effd5020a57c448e",
  "arc-ill-featkoi_S9ryne-e437c60b2c.png": "4b257f960e84fe9e78700764364de5de464bc436add449d08f98edc3a16ea4e8",
  "arc-ill-seatrus-0786316b26.png": "8a0f4cd9c986232ca1e2e878babeda09739128d94aa4e9321a3631667f378d15",
  "arc-ill-seatrus-a9b13bd035.png": "c7468d4c2b2a0028d5fe2de4eb6450d373a5a882d45fb4b3ca6f06bbafd58eec",
};

function cardText(card: Element, selector: string) {
  return card.querySelector(selector)?.textContent?.trim() || "";
}

describe("Arcaea B30 reference bindings", () => {
  it("keeps every visual slot bound to the exact record and artwork", () => {
    const template = document.createElement("template");
    template.innerHTML = PAGE_DEFINITIONS["arcgrosB19/arcgrosB19"].markup;
    const cards = Array.from(template.content.querySelectorAll(".box > .song_box"));

    const actual = cards.map((card): ArcCard => {
      const artwork = card.querySelector<HTMLImageElement>(".ill_box > img");
      const difficulty = card.querySelector(".difficulty");
      const rank = difficulty?.classList.contains("AT") ? "AT" : "IN";
      const acc = Array.from(card.querySelector(".acc")?.children || [])
        .map((part) => part.textContent?.trim() || "")
        .join(".");

      return [
        card.getAttribute("data-card-key") || "",
        cardText(card, ".name"),
        artwork?.getAttribute("src")?.split("/").at(-1) || "",
        rank,
        cardText(card, ".difficulty"),
        cardText(card, ".rks"),
        cardText(card, ".score"),
        acc,
        (card.querySelector<HTMLImageElement>(".rating_box img")?.alt || "") as ArcCard[8],
      ];
    });

    expect(actual).toEqual(REFERENCE_CARDS);
    expect(new Set(actual.map((card) => card[2]))).toHaveLength(28);
  });

  it("locks each visual slot to the expected artwork bytes instead of trusting labels", () => {
    const artworkNames = new Set<string>();

    for (const [slot, title, artwork] of REFERENCE_CARDS) {
      artworkNames.add(artwork);
      const bytes = readFileSync(resolve(process.cwd(), "public", "demo", "song-covers", artwork));
      expect(createHash("sha256").update(bytes).digest("hex"), `${slot} ${title} -> ${artwork}`)
        .toBe(REFERENCE_ARTWORK_SHA256[artwork]);
    }

    // Repeated songs at different difficulties intentionally resolve to the
    // same digest; every other card still has its own reference-checked asset.
    expect(artworkNames).toEqual(new Set(Object.keys(REFERENCE_ARTWORK_SHA256)));
    expect(artworkNames).toHaveLength(28);
  });
});
