import commonCss from "../theme/common-preview.css?raw";
import baseB19Css from "../theme/base-b19.css?raw";
import { DIFFICULTY_COLOR_CSS } from "../lib/difficultyColors";
import { RATING_KEYS } from "../types/theme";
import type {
  PackageAsset,
  RatingKey,
  ThemeDraft,
  ThemeResources,
} from "../types/theme";

export const PREVIEW_PAGES = [
  { id: "b19", label: "B19" },
  { id: "b27", label: "B27" },
  { id: "b30", label: "B30" },
  { id: "b33", label: "B33 / 溢出" },
  { id: "analysis", label: "B30 数据分析" },
] as const;

export type PreviewPage = (typeof PREVIEW_PAGES)[number]["id"];
export const DEFAULT_PREVIEW_PAGE: PreviewPage = "analysis";

/** The canonical userSetting fixture contains both plugin settings views. */
export const USER_SETTING_VARIANTS = [
  { id: "personal", label: "个人" },
  { id: "api", label: "API" },
] as const;

export type UserSettingVariant = (typeof USER_SETTING_VARIANTS)[number]["id"];
export const DEFAULT_USER_SETTING_VARIANT: UserSettingVariant = "personal";

/** Canvas heights include the complete visible panel and footer for each view. */
export const USER_SETTING_VARIANT_HEIGHTS: Record<UserSettingVariant, number> = {
  personal: 1465,
  api: 1320,
};

// phi-plugin renders these blocks only for certain saves or plugin settings.
// The editor keeps them in the DOM so their styles stay reachable, and lets the
// user decide which conditional states the canvas should show.
export const PREVIEW_OPTIONS = [
  {
    id: "spInfo",
    label: "版本提示",
    hint: "存档版本与插件版本不一致时显示 .spInfoBox",
  },
  {
    id: "accAvg",
    label: "平均 ACC",
    hint: "开启 b30 平均 ACC 后每张成绩卡显示 .accAvg",
  },
  {
    id: "cpToOld",
    label: "定数对比",
    hint: "旧版本存档会显示与新定数的 RKS 差值 .cpToOld",
  },
  {
    id: "nosignal",
    label: "无成绩占位",
    hint: "Phi 槽位没有成绩时用 .Nosignal 卡片占位",
  },
  {
    id: "tagInsufficient",
    label: "标签数据不足",
    hint: "标签票数不足时模糊雷达图并显示提示",
  },
  {
    id: "histogramWide",
    label: "宽版直方图",
    hint: "未启用标签接口时隐藏标签面板并铺满直方图",
  },
] as const;

export type PreviewOption = (typeof PREVIEW_OPTIONS)[number]["id"];
export type PreviewOptions = Record<PreviewOption, boolean>;

export const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = {
  spInfo: true,
  accAvg: true,
  cpToOld: false,
  nosignal: false,
  tagInsufficient: false,
  histogramWide: false,
};

export const PREVIEW_PAGE_HEIGHTS: Record<PreviewPage, number> = {
  // Values include the header, all score rows, analysis panels and footer.
  // Keeping a little breathing room here prevents the iframe viewport from
  // clipping the last text baseline at common font sizes.
  b19: 1220,
  b27: 1460,
  b30: 1590,
  b33: 1900,
  analysis: 1960,
};

const demoAssetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}demo/${path}`;
const defaultFontUrl = () => `${import.meta.env.BASE_URL}font/phi.ttf`;

type PreviewScoreRecord = {
  title: string;
  rank: "AT" | "IN" | "HD" | "EZ";
  difficulty: string;
  rks: string;
  rating: RatingKey;
  score: string;
  acc: string;
  cover: string;
  suggestion: { text: string; kind?: 0 | 1 | 2 | 3 | 4 | 5 };
};

// Canonical 3 Phi + 33 Best fixture exported by phi-plugin. Every score field
// and its artwork live in one record so titles and covers cannot drift apart.
const previewScoreRecords = [
  { title: "BANGING STRIKE", rank: "IN", difficulty: "15.9", rks: "15.90", rating: "phi", score: "1000000", acc: "100.00", cover: "song-covers/ill-BANGINGSTRIKE_DewPleiades-da5d4e74a8.webp", suggestion: { text: "无法推分" } },
  { title: "蝎虎天体 -Lacertid-", rank: "IN", difficulty: "15.5", rks: "15.50", rating: "phi", score: "1000000", acc: "100.00", cover: "song-covers/ill-Lacertid_CreamvsDaily-cdb4419018.webp", suggestion: { text: "无法推分" } },
  { title: "星拂云锦 feat. koi", rank: "IN", difficulty: "15.5", rks: "15.50", rating: "phi", score: "1000000", acc: "100.00", cover: "song-covers/ill-featkoi_S9ryne-e437c60b2c.webp", suggestion: { text: "无法推分" } },
  { title: "DESTRUCTION 3,2,1", rank: "AT", difficulty: "17.3", rks: "16.79", rating: "S", score: "957285", acc: "99.33", cover: "song-covers/ill-DESTRUCTION321_Normal1zervsBrokenNerdz-0dcfe2bb06.webp", suggestion: { text: "99.3745%", kind: 2 } },
  { title: "Stasis", rank: "AT", difficulty: "16.7", rks: "16.55", rating: "V", score: "981768", acc: "99.80", cover: "song-covers/ill-Stasis_Maozon-7cc480c09f.webp", suggestion: { text: "99.8379%", kind: 4 } },
  { title: "祈 -我ら神祖と共に歩む者なり-", rank: "AT", difficulty: "17.3", rks: "16.48", rating: "S", score: "930644", acc: "98.92", cover: "song-covers/ill--_-_VS_VSKaiVS_VS-2f6a40e8a2.webp", suggestion: { text: "98.9556%", kind: 1 } },
  { title: "Re：End of a Dream", rank: "AT", difficulty: "16.9", rks: "16.40", rating: "V", score: "974630", acc: "99.33", cover: "song-covers/ill-ReEndofaDream_umavs-8e8c553dc4.webp", suggestion: { text: "99.3690%", kind: 2 } },
  { title: "Distorted Fate", rank: "AT", difficulty: "17.4", rks: "16.39", rating: "S", score: "946871", acc: "98.67", cover: "song-covers/ill-DistortedFate_Sakuzyo-843f17a871.webp", suggestion: { text: "98.7112%", kind: 1 } },
  { title: "Lyrith -迷宮リリス-", rank: "AT", difficulty: "16.5", rks: "16.38", rating: "FC", score: "998471", acc: "99.83", cover: "song-covers/ill-Lyrith-812c00b2ee.webp", suggestion: { text: "99.8713%", kind: 5 } },
  { title: "AbsoluTe disoRdeR", rank: "AT", difficulty: "17.2", rks: "16.34", rating: "S", score: "933837", acc: "98.86", cover: "song-covers/ill-AbsoluTedisoRdeR_AcuteDisarray-ee4743086a.webp", suggestion: { text: "98.8972%", kind: 1 } },
  { title: "BANGING STRIKE", rank: "AT", difficulty: "16.8", rks: "16.31", rating: "V", score: "970373", acc: "99.33", cover: "song-covers/low-BANGINGSTRIKE_DewPleiades-7f61c09517.webp", suggestion: { text: "99.3731%", kind: 2 } },
  { title: "ATHAZA", rank: "AT", difficulty: "16.6", rks: "16.28", rating: "V", score: "972675", acc: "99.57", cover: "song-covers/ill-ATHAZA_LeaF-4cc579be5e.webp", suggestion: { text: "99.6097%", kind: 3 } },
  { title: "祈 -我ら神祖と共に歩む者なり-", rank: "IN", difficulty: "16.4", rks: "16.20", rating: "V", score: "975806", acc: "99.73", cover: "song-covers/low--_-_VS_VSKaiVS_VS-2b65809fea.webp", suggestion: { text: "99.7671%", kind: 4 } },
  { title: "Ad astra per aspera", rank: "IN", difficulty: "16.3", rks: "16.15", rating: "V", score: "964742", acc: "99.79", cover: "song-covers/ill-Adastraperaspera_RabbitHouse-c041d57d3d.webp", suggestion: { text: "99.8320%", kind: 4 } },
  { title: "幻影鬼魅 (PLEASE)", rank: "AT", difficulty: "17.0", rks: "16.13", rating: "S", score: "943956", acc: "98.84", cover: "song-covers/ill-PLEASE_R300K-58056e2115.webp", suggestion: { text: "98.8794%", kind: 1 } },
  { title: "Spasmodic", rank: "AT", difficulty: "16.7", rks: "16.13", rating: "S", score: "939237", acc: "99.23", cover: "song-covers/ill-Spasmodic-672d9c0126.webp", suggestion: { text: "99.2693%", kind: 2 } },
  { title: "彩", rank: "IN", difficulty: "16.4", rks: "16.12", rating: "V", score: "979760", acc: "99.62", cover: "song-covers/ill-MisoilePunch-41952f5ca5.webp", suggestion: { text: "99.6595%", kind: 3 } },
  { title: "PRAGMATISM -RESURRECTION-", rank: "AT", difficulty: "16.6", rks: "16.12", rating: "V", score: "990826", acc: "99.34", cover: "song-covers/ill-PRAGMATISMRESURRECTION_Laur-78e98aa291.webp", suggestion: { text: "99.3840%", kind: 2 } },
  { title: "夢の降る日に", rank: "IN", difficulty: "16.6", rks: "16.11", rating: "S", score: "953536", acc: "99.34", cover: "song-covers/ill-seatrus-a9b13bd035.webp", suggestion: { text: "99.3777%", kind: 2 } },
  { title: "Fractured Angel", rank: "IN", difficulty: "16.3", rks: "16.11", rating: "FC", score: "997675", acc: "99.74", cover: "song-covers/ill-FracturedAngel_DJRaisei-be1b016a4f.webp", suggestion: { text: "99.7835%", kind: 4 } },
  { title: "Distorted Fate", rank: "IN", difficulty: "16.3", rks: "16.11", rating: "FC", score: "997609", acc: "99.73", cover: "song-covers/low-DistortedFate_Sakuzyo-10027a8230.webp", suggestion: { text: "99.7761%", kind: 4 } },
  { title: "Avataar ~Reincarnation of Kalpa~", rank: "AT", difficulty: "16.6", rks: "16.08", rating: "V", score: "977803", acc: "99.29", cover: "song-covers/ill-AvataarReincarnationofKalpa_ScarletteakaCrYmson-1c144e7044.webp", suggestion: { text: "99.3339%", kind: 2 } },
  { title: "70 Minutes Fighters", rank: "IN", difficulty: "16.5", rks: "16.08", rating: "S", score: "943552", acc: "99.43", cover: "song-covers/ill-70MinutesFighters-cf17174890.webp", suggestion: { text: "99.4668%", kind: 2 } },
  { title: "Cthugha", rank: "AT", difficulty: "16.1", rks: "16.05", rating: "FC", score: "999346", acc: "99.93", cover: "song-covers/ill-Cthugha_USAO-b4825bb0eb.webp", suggestion: { text: "99.9695%", kind: 5 } },
  { title: "Bounded Quietude", rank: "IN", difficulty: "16.2", rks: "16.03", rating: "FC", score: "996571", acc: "99.76", cover: "song-covers/ill-BoundedQuietude_FiniteLimitvsSiLiS-3eb9deba09.webp", suggestion: { text: "99.8049%", kind: 4 } },
  { title: "NO x", rank: "IN", difficulty: "16.1", rks: "15.99", rating: "FC", score: "998630", acc: "99.85", cover: "song-covers/ill-NOx_Juggernaut-c72229ef82.webp", suggestion: { text: "99.8901%", kind: 5 } },
  { title: "Incyde", rank: "IN", difficulty: "16.2", rks: "15.99", rating: "V", score: "972357", acc: "99.71", cover: "song-covers/ill-Incyde_YbeLL-da5432d6b4.webp", suggestion: { text: "99.7509%", kind: 4 } },
  { title: "Rrhar'il", rank: "IN", difficulty: "16.1", rks: "15.98", rating: "FC", score: "998546", acc: "99.84", cover: "song-covers/ill-Rrharil_TeamGrimoire-fbdeaeaf28.webp", suggestion: { text: "99.8807%", kind: 5 } },
  { title: "AbsoluTe disoRdeR", rank: "IN", difficulty: "16.3", rks: "15.91", rating: "V", score: "978284", acc: "99.46", cover: "song-covers/low-AbsoluTedisoRdeR_AcuteDisarray-354a18d309.webp", suggestion: { text: "99.5046%", kind: 3 } },
  { title: "零號車輛", rank: "IN", difficulty: "16.2", rks: "15.90", rating: "V", score: "977649", acc: "99.58", cover: "song-covers/ill-seatrus-0786316b26.webp", suggestion: { text: "99.6269%", kind: 3 } },
  { title: "BANGING STRIKE", rank: "IN", difficulty: "15.9", rks: "15.90", rating: "phi", score: "1000000", acc: "100.00", cover: "song-covers/low-BANGINGSTRIKE_DewPleiades-7f61c09517.webp", suggestion: { text: "无法推分" } },
  { title: "明鏡烈火", rank: "IN", difficulty: "15.9", rks: "15.87", rating: "FC", score: "999645", acc: "99.96", cover: "song-covers/ill-MUEvsRekuMochizuki-114a11ca73.webp", suggestion: { text: "无法推分", kind: 5 } },
  { title: "+ERABY+E CONNEC+10N", rank: "IN", difficulty: "16.3", rks: "15.87", rating: "S", score: "958941", acc: "99.40", cover: "song-covers/ill-ERABYECONNEC10N-9fb8589597.webp", suggestion: { text: "99.4898%", kind: 2 } },
  { title: "PRAGMATISM -RESURRECTION-", rank: "IN", difficulty: "16.0", rks: "15.85", rating: "FC", score: "997793", acc: "99.79", cover: "song-covers/low-PRAGMATISMRESURRECTION_Laur-017bc77509.webp", suggestion: { text: "99.9050%", kind: 5 } },
  { title: "DESTRUCTION 3,2,1", rank: "IN", difficulty: "16.3", rks: "15.85", rating: "V", score: "965633", acc: "99.37", cover: "song-covers/low-DESTRUCTION321_Normal1zervsBrokenNerdz-d9791b5d51.webp", suggestion: { text: "99.4898%", kind: 2 } },
  { title: "QZKago Requiem", rank: "AT", difficulty: "17.4", rks: "15.84", rating: "A", score: "916947", acc: "97.94", cover: "song-covers/low-QZKagoRequiem_tpazolite-6eec5def52.webp", suggestion: { text: "98.0606%", kind: 0 } },
] satisfies readonly PreviewScoreRecord[];

const semantic = (name: string, selector: string) =>
  `data-gjs-name="${name}" data-phi-selector="${selector}"`;

// Both paths come from phi-plugin's b19.art: a check mark for finished
// suggestions and a double chevron whose rotation encodes the comparison kind.
const CHECK_PATH =
  "M892.064 261.888a31.936 31.936 0 0 0-45.216 1.472L421.664 717.248l-220.448-185.216a32 32 0 1 0-41.152 48.992l243.648 204.704a31.872 31.872 0 0 0 20.576 7.488 31.808 31.808 0 0 0 23.36-10.112L893.536 307.136a32 32 0 0 0-1.472-45.248z";
const CHEVRON_PATH =
  "M564.8 465.184l4.192 3.904 274.72 274.752a32 32 0 0 1 0 45.248l-22.624 22.624a32 32 0 0 1-45.248 0l-263.456-263.392-263.424 263.392a32 32 0 0 1-42.24 2.656l-3.008-2.656-22.624-22.624a32 32 0 0 1 0-45.248l274.784-274.752a80 80 0 0 1 108.96-3.904z m0-256l4.192 3.904 274.72 274.752a32 32 0 0 1 0 45.248l-22.624 22.624a32 32 0 0 1-45.248 0l-263.456-263.392-263.424 263.392a32 32 0 0 1-42.24 2.656l-3.008-2.656-22.624-22.624a32 32 0 0 1 0-45.248l274.784-274.752a80 80 0 0 1 108.96-3.904z";

const ACC_KINDS = [
  ["accHigher", "高于平均"],
  ["accLower", "低于平均"],
  ["accHyper", "远高于平均"],
  ["accFinished", "已完成推分"],
] as const;

const chevronSvg = (name: string, selector: string) => `
  <svg viewBox="0 0 1024 1024" ${semantic(name, selector)}><path ${semantic("对比箭头路径", `${selector} path`)} d="${CHEVRON_PATH}" fill="#333333"></path></svg>`;

function accAvgBadge(index: number) {
  const [kind, kindLabel] = ACC_KINDS[index % ACC_KINDS.length];
  const marks = ["99.4231", "98.8107", "99.9012", "99.6644"];
  const icon =
    kind === "accFinished"
      ? `<svg viewBox="0 0 1024 1024" ${semantic("平均 ACC 图标", ".accAvg svg")}><path ${semantic("平均 ACC 图标路径", ".accAvg path")} d="${CHECK_PATH}"></path></svg>`
      : chevronSvg("平均 ACC 图标", ".accAvg svg");
  return `
    <div class="accAvg ${kind} clip-box" ${semantic(`平均 ACC（${kindLabel}）`, ".accAvg")} data-phi-optional="accAvg">
      <div class="accAvgLine clip-box" ${semantic("平均 ACC 强调线", ".accAvgLine")}></div>
      ${icon}
      <p ${semantic("平均 ACC 文字", ".accAvg p")}>Avg: ${marks[index % marks.length]}%</p>
    </div>`;
}

function cpToOldBadge(index: number) {
  const kind = index % 2 ? "accHigher" : "accLower";
  return `
    <div class="cpToOld ${kind} clip-box-left" ${semantic("定数对比", ".cpToOld")} data-phi-optional="cpToOld">
      <p ${semantic("定数对比标题", ".cpToOld p")}>Dif</p>
      ${chevronSvg("定数对比箭头", ".cpToOld svg")}
      <p>0.${(index % 8) + 1}&ensp;&ensp;&ensp;RKS</p>
      ${chevronSvg("定数对比箭头", ".cpToOld svg")}
      <p>0.0${(index % 9) + 1}</p>
    </div>`;
}

function noSignalCard() {
  const corners = ["left_top", "right_top", "left_bottom", "right_bottom"]
    .map(
      (corner) =>
        `<div class="border_corner border_corner_${corner}" ${semantic("取景框角标", `.border_corner_${corner}`)}></div>`,
    )
    .join("");
  return `
    <div class="Nosignal" ${semantic("无成绩占位卡", ".Nosignal")} data-phi-slot="phi" data-phi-index="3" data-phi-optional="nosignal">
      ${corners}
      <div class="line" ${semantic("占位横线", ".Nosignal .line")}></div>
      <div class="timeout" ${semantic("超时标题", ".Nosignal .timeout")}><p ${semantic("超时标题文字", ".Nosignal .timeout p")}>TIME_OUT</p></div>
      <div class="client" ${semantic("客户端提示", ".Nosignal .client")}><p ${semantic("客户端提示文字", ".Nosignal .client p")}>&gt;&gt;&gt; PhigrOS Client Finding Phi.score</p></div>
      <div class="sqrt" ${semantic("斜纹条", ".Nosignal .sqrt")}></div>
    </div>`;
}

function songCard(index: number) {
  const record = previewScoreRecords[index];
  const {
    title,
    rank,
    difficulty,
    rks,
    rating,
    score,
    acc,
    cover,
    suggestion,
  } = record;
  const phi = index < 3;
  const bestIndex = index - 2;
  const number = phi ? `P${index + 1}` : `#${bestIndex}`;
  const kind = phi ? "phi_song" : bestIndex <= 27 ? "b_song" : "";
  const suggestionText = suggestion.text;
  const suggestionKind = suggestionText.endsWith("%") && suggestion.kind !== undefined
    ? ` suggest-kind-${suggestion.kind}`
    : "";
  // The third Phi slot doubles as the .Nosignal placeholder position, matching
  // the runtime template where a missing record replaces the whole card.
  const replaceable = index === 2 ? ' data-phi-optional-not="nosignal"' : "";
  return `
    <div class="song ${kind}" ${semantic(`成绩卡 ${number}`, ".song")} data-phi-role="song-card" data-phi-slot="${phi ? "phi" : "best"}" data-phi-index="${phi ? index + 1 : bestIndex}"${replaceable}>
      <div class="ill-box" ${semantic("曲绘区域", ".ill-box")}>
        <div class="num clip-box" ${semantic("成绩序号", ".num")}><p>${number}</p></div>
        <div class="ill clip-box" ${semantic("曲绘", ".ill")}><img ${semantic("曲绘图片", ".ill img")} src="${demoAssetUrl(cover)}" alt="${title}"></div>
        <div class="rank-${rank} clip-box" ${semantic(`难度标签 ${rank}`, `.rank-${rank}`)}>
          <div class="org" ${semantic("谱面难度", `.rank-${rank} .org`)}><p ${semantic("谱面难度文字", `.rank-${rank} .org p`)}>${rank}&ensp;${difficulty}</p></div>
          <div class="rel" ${semantic("单曲 RKS", `.rank-${rank} .rel`)}><p ${semantic("单曲 RKS 数值", `.rank-${rank} .rel p`)}>${rks}</p></div>
        </div>
      </div>
      <div class="info-${rank}" ${semantic(`成绩信息 ${rank}`, `.info-${rank}`)}>
        <div class="songname" ${semantic("曲名", ".songname")}><p ${semantic("曲名文字", ".songname p")}>${title}</p></div>
        <div class="songinfo" ${semantic("分数信息", ".songinfo")}>
          <div class="Rating" ${semantic("评级图标", ".Rating")}>
            <img ${semantic("评级图标本体", ".Rating img")} data-rating="${rating}" src="${demoAssetUrl(`rating/${rating}.png`)}" alt="${rating}">
          </div>
          <div class="chengji" ${semantic("成绩数值", ".chengji")}>
            <div class="score" ${semantic("分数", ".score")}><p ${semantic("分数文字", ".score p")}>${score}</p></div>
            <div class="line" ${semantic("分数分隔线", ".chengji .line")}></div>
            <div class="acc-box" ${semantic("准确率区域", ".acc-box")}>
              <div class="acc" ${semantic("准确率", ".acc")}><p ${semantic("准确率文字", ".acc p")}>${acc}%</p></div>
              <div class="suggest${suggestionKind}" ${semantic("推分建议", ".suggest")}><div class="suggest-tip" ${semantic("建议标记", ".suggest-tip")}></div><p ${semantic("推分建议文字", ".suggest p")}>${suggestionText}</p></div>
            </div>
          </div>
        </div>
      </div>
      ${accAvgBadge(index)}
      ${cpToOldBadge(index)}
    </div>`;
}

const flowHeading = (title: string, attributes = "") => `
  <div class="over_flow" ${semantic(title, ".over_flow")} ${attributes}>
    <div class="flow_line_box_l" ${semantic("左侧分隔线", ".flow_line_box_l")}>${'<div class="flow_line"></div>'.repeat(6)}</div>
    <p><i>${title}</i></p>
    <div class="flow_line_box_r" ${semantic("右侧分隔线", ".flow_line_box_r")}>${'<div class="flow_line"></div>'.repeat(6)}</div>
  </div>`;

const radarCategories = [
  ["节奏", 100, 8, "middle", 100, 27, "16.48"],
  ["耐力", 187, 65, "end", 165, 71, "16.22"],
  ["读谱", 154, 174, "end", 143, 142, "15.94"],
  ["协调", 46, 174, "start", 57, 142, "16.08"],
  ["精度", 13, 65, "start", 35, 71, "16.37"],
] as const;

type PreviewHistogramRecord = {
  kind: "phi" | "best";
  label: string;
  rks: number;
};

function niceAxisStep(value: number) {
  const candidates = [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1];
  return candidates.find((candidate) => candidate >= value) ?? Math.ceil(value);
}

function buildPreviewHistogram(records: readonly PreviewHistogramRecord[]) {
  const valid = records.filter((record) => Number.isFinite(record.rks));
  const values = valid.map((record) => record.rks);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const step = niceAxisStep(Math.max(maximum - minimum, 0.2) / 4);
  const domainMin = Math.floor((minimum - step * 0.1) / step) * step;
  let domainMax = Math.ceil((maximum + step * 0.1) / step) * step;
  if (domainMax <= domainMin) domainMax = domainMin + step;
  const domainRange = domainMax - domainMin;
  const tickCount = Math.round(domainRange / step);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => ({
    label: (domainMin + index * step).toFixed(2),
    position: (index / tickCount) * 100,
  }));
  const slots = valid.map((record) => ({
    ...record,
    height: Math.min(
      100,
      Math.max(0, ((record.rks - domainMin) / domainRange) * 100),
    ),
  }));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    average,
    averagePosition: Math.min(
      100,
      Math.max(0, ((average - domainMin) / domainRange) * 100),
    ),
    slots,
    ticks,
  };
}

const previewHistogram = buildPreviewHistogram(
  previewScoreRecords.slice(0, 30).map((record, index) => ({
    kind: index < 3 ? "phi" : "best",
    label: index < 3 ? `P${index + 1}` : `B${index - 2}`,
    rks: Number(record.rks),
  })),
);

function analysisMarkup() {
  const grid = [
    "100,27 162,72 138,144 62,144 38,72",
    "100,43 146,77 128,130 72,130 54,77",
    "100,59 130,82 119,116 81,116 70,82",
  ];
  const axes = [
    [100, 27],
    [162, 72],
    [138, 144],
    [62, 144],
    [38, 72],
  ];
  const strong = [
    ["节奏爆发", "16.55"],
    ["高速交互", "16.42"],
    ["纵连处理", "16.31"],
  ] as const;
  const weak = [
    ["低速读谱", "15.76"],
    ["多押协调", "15.82"],
    ["长段耐力", "15.88"],
  ] as const;
  const rankingRows = (
    items: readonly (readonly [string, string])[],
    weakRows = false,
  ) =>
    items
      .map(
        ([name, rks], index) => `
    <div class="tag-result-row" ${semantic(`${weakRows ? "薄弱" : "擅长"}词条 ${index + 1}`, ".tag-result-row")}>
      <p class="tag-rank" ${semantic("词条排名", weakRows ? ".weak-tags .tag-rank" : ".tag-rank")}>${index + 1}</p>
      <p class="tag-name" ${semantic("词条名称", ".tag-name")}>${name}</p>
      <p class="tag-rks" ${semantic("词条 RKS", ".tag-rks")}>${rks}</p>
    </div>`,
      )
      .join("");

  return `
    ${flowHeading("B30 数据分析", "data-phi-analysis")}
    <div class="b30-analysis-row" ${semantic("B30 数据分析区", ".b30-analysis-row")} data-phi-analysis>
      <section class="analysis-panel tag-analysis-panel clip-box" ${semantic("谱面标签能力面板", ".tag-analysis-panel")} data-phi-optional-not="histogramWide">
        <div class="analysis-panel-head" ${semantic("分析面板标题栏", ".analysis-panel-head")}>
          <div><p class="analysis-kicker" ${semantic("分析英文标题", ".analysis-kicker")}>CHART PROFILE</p><p class="analysis-title" ${semantic("分析标题", ".analysis-title")}>谱面标签能力</p></div>
          <p class="analysis-meta" ${semantic("分析统计信息", ".analysis-meta")}>有效票 2,816</p>
        </div>
        <div class="tag-analysis-body" ${semantic("标签分析内容", ".tag-analysis-body")}>
          <div class="tag-analysis-content" ${semantic("标签分析布局", ".tag-analysis-content")}>
            <div class="tag-radar-column" ${semantic("雷达图区域", ".tag-radar-column")}>
              <div class="tag-radar-title" ${semantic("雷达图小标题", ".tag-radar-title")}><span></span><p>分类汇总</p></div>
              <svg class="tag-radar" ${semantic("谱面能力雷达图", ".tag-radar")} viewBox="0 0 200 184" aria-label="分类标签能力雷达图">
                ${grid.map((points) => `<polygon class="tag-radar-grid" ${semantic("雷达网格", ".tag-radar-grid")} points="${points}"></polygon>`).join("")}
                ${axes.map(([x, y]) => `<line class="tag-radar-axis" ${semantic("雷达坐标轴", ".tag-radar-axis")} x1="100" y1="92" x2="${x}" y2="${y}"></line>`).join("")}
                <polygon class="tag-radar-shape" ${semantic("雷达能力区域", ".tag-radar-shape")} points="100,29 154,74 132,135 69,137 45,73"></polygon>
                ${radarCategories
                  .map(
                    ([name, labelX, labelY, anchor, pointX, pointY, value]) => `
                  <circle class="tag-radar-point" ${semantic("雷达数据点", ".tag-radar-point")} cx="${pointX}" cy="${pointY}" r="2.3"></circle>
                  <text class="tag-radar-label" ${semantic("雷达维度名称", ".tag-radar-label")} x="${labelX}" y="${labelY}" text-anchor="${anchor}"><tspan x="${labelX}">${name}</tspan><tspan class="tag-radar-score" ${semantic("雷达维度数值", ".tag-radar-score")} x="${labelX}" dy="10">${value}</tspan></text>`,
                  )
                  .join("")}
              </svg>
            </div>
            <div class="tag-ranking-column" ${semantic("词条排行区域", ".tag-ranking-column")}>
              <div class="tag-ranking-group strong-tags" ${semantic("擅长词条组", ".strong-tags")}><div class="tag-column-title" ${semantic("词条组标题", ".tag-column-title")}><span></span><p>擅长词条</p></div>${rankingRows(strong)}</div>
              <div class="tag-ranking-group weak-tags" ${semantic("薄弱词条组", ".weak-tags")}><div class="tag-column-title" ${semantic("词条组标题", ".tag-column-title")}><span></span><p>薄弱词条</p></div>${rankingRows(weak, true)}</div>
            </div>
          </div>
          <div class="tag-insufficient-message" ${semantic("标签数据不足提示", ".tag-insufficient-message")} data-phi-optional="tagInsufficient">
            <p ${semantic("数据不足提示文字", ".tag-insufficient-message p")}>可用谱面标签统计量不足，请前往 https://www.phib19.top 或使用 /settag 进行谱面标签投票</p>
          </div>
        </div>
        <div class="tag-analysis-tip" ${semantic("标签投票提示", ".tag-analysis-tip")} data-phi-optional-not="tagInsufficient">
          <p ${semantic("投票提示文字", ".tag-analysis-tip p")}>当前谱面标签统计量较小，可以前往 https://www.phib19.top 或使用 /settag 指令进行投票哦！</p>
        </div>
      </section>
      <section class="analysis-panel histogram-panel clip-box" ${semantic("等效 RKS 直方图面板", ".histogram-panel")}>
        <div class="analysis-panel-head" ${semantic("分析面板标题栏", ".analysis-panel-head")}>
          <div><p class="analysis-kicker" ${semantic("分析英文标题", ".analysis-kicker")}>RKS DISTRIBUTION</p><p class="analysis-title" ${semantic("分析标题", ".analysis-title")}>等效 RKS 直方图</p></div>
          <div class="histogram-summary" ${semantic("直方图摘要", ".histogram-summary")}><p>平均 RKS</p><p>${previewHistogram.average.toFixed(4)}</p></div>
        </div>
        <div class="histogram-chart" ${semantic("直方图绘图区", ".histogram-chart")}>
          <div class="histogram-y-label" ${semantic("直方图纵轴标题", ".histogram-y-label")}>等效单曲 RKS</div>
          <div class="histogram-plot" ${semantic("直方图坐标区", ".histogram-plot")}>
            <div class="histogram-scale" ${semantic("直方图刻度区", ".histogram-scale")}>
              ${previewHistogram.ticks.map((tick) => `<div class="histogram-grid-line" ${semantic("直方图网格线", ".histogram-grid-line")}><p>${tick.label}</p></div>`).join("")}
              <div class="average-marker" ${semantic("平均 RKS 标记线", ".average-marker")}><p>AVG ${previewHistogram.average.toFixed(4)}</p></div>
            </div>
            <div class="histogram-bars" ${semantic("直方图柱组", ".histogram-bars")}>
              ${previewHistogram.slots.map((slot, index) => `<div class="histogram-slot" data-rks="${slot.rks.toFixed(2)}" ${semantic(`RKS 槽位 ${index + 1}`, ".histogram-slot")}><div class="histogram-bar-area" ${semantic("柱体区域", ".histogram-bar-area")}><div class="histogram-bar ${slot.kind === "phi" ? "phi-bar" : "best-bar"}" ${semantic(slot.kind === "phi" ? "P1-P3 柱体" : "B1-B27 柱体", slot.kind === "phi" ? ".phi-bar" : ".best-bar")}></div></div><p class="histogram-slot-label" ${semantic("槽位标签", ".histogram-slot-label")}>${slot.label}</p></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="histogram-legend" ${semantic("直方图图例", ".histogram-legend")}><p><span class="legend-dot phi-dot"></span>P1-P3</p><p><span class="legend-dot best-dot"></span>B1-B27</p><p>${previewHistogram.slots.length} 个有效槽位</p></div>
      </section>
    </div>`;
}

const scoreCards = previewScoreRecords.map((_, index) => songCard(index));

export const PREVIEW_MARKUP = `
  <div class="background" ${semantic("主题背景", ".background")} data-phi-role="background"><img src="${demoAssetUrl("background.png")}" alt="主题背景"></div>
  <div class="title" ${semantic("玩家信息栏", ".title")} data-phi-role="header">
    <div class="playerInfo" ${semantic("玩家资料", ".playerInfo")}>
      <div class="blackBlock clip-box" ${semantic("玩家资料背景", ".blackBlock")}></div>
      <div class="avatar clip-box" ${semantic("头像", ".avatar")}><img src="${demoAssetUrl("avatar.png")}" alt="头像"></div>
      <div class="playerId" ${semantic("玩家 ID", ".playerId")}><p ${semantic("玩家 ID 文字", ".playerId p")}>PHI DESIGNER</p></div>
      <div class="rks clip-box" ${semantic("玩家 RKS", ".rks")}><p ${semantic("玩家 RKS 数值", ".rks p")}>16.0963</p></div>
      <div class="clgBox" ${semantic("课题模式区域", ".clgBox")}><div class="Challenge" ${semantic("课题模式", ".Challenge")}><img ${semantic("课题模式图标", ".Challenge img")} src="${demoAssetUrl("challenge.png")}" alt="课题模式"><p ${semantic("课题模式数字", ".Challenge p")}>48</p></div></div>
      <div class="date" ${semantic("更新时间", ".date")}><p ${semantic("更新时间文字", ".date p")}>2026/08/11 19:01:58</p></div>
      <div class="dataBox clip-box" ${semantic("Data 信息", ".dataBox")}><img ${semantic("Data 图标", ".dataBox img")} src="${demoAssetUrl("data.png")}" alt="Data"><p ${semantic("Data 文字", ".dataBox p")}>377MiB 674KiB</p></div>
      <div class="spInfoBox" ${semantic("版本提示区", ".spInfoBox")} data-phi-optional="spInfo">
        ${["3.13.0 Update to 3.14.0", "Real RKS: 16.0963"]
          .map(
            (text) =>
              `<div class="spInfo colorful-background clip-box" ${semantic("版本提示", ".spInfo")}><p ${semantic("版本提示文字", ".spInfo p")}>${text}</p></div>`,
          )
          .join("")}
      </div>
    </div>
    <div class="recordInfo clip-box" ${semantic("成绩统计", ".recordInfo")}>
        <div class="whiteLine clip-box" ${semantic("统计强调线", ".whiteLine")}></div>
      <div class="sheet" ${semantic("成绩统计表", ".sheet")}>
        <div class="row"><div class="poz"><p>\\</p></div><div class="poz"><p>EZ</p></div><div class="poz"><p>HD</p></div><div class="poz"><p>IN</p></div><div class="poz"><p>AT</p></div></div>
        <div class="row"><div class="poz"><p>C</p></div><div class="poz"><p>66</p></div><div class="poz"><p>67</p></div><div class="poz"><p>205</p></div><div class="poz"><p>36</p></div></div>
        <div class="row"><div class="poz"><p>FC</p></div><div class="poz"><p>10</p></div><div class="poz"><p>13</p></div><div class="poz"><p>39</p></div><div class="poz"><p>3</p></div></div>
        <div class="row"><div class="poz"><p>Phi</p></div><div class="poz"><p>3</p></div><div class="poz"><p>1</p></div><div class="poz"><p>11</p></div><div class="poz"><p>1</p></div></div>
      </div>
    </div>
  </div>
  <div class="b19" ${semantic("成绩网格", ".b19")} data-phi-role="score-grid">
    ${scoreCards.slice(0, 3).join("")}
    ${noSignalCard()}
    ${scoreCards.slice(3, 30).join("")}
    ${flowHeading("OVER FLOW", "data-phi-overflow")}
    ${scoreCards.slice(30).join("")}
  </div>
  ${analysisMarkup()}
  <div class="createdbox" ${semantic("页脚", ".createdbox")} data-phi-role="footer"><div class="phi-plugin" ${semantic("插件名称", ".phi-plugin")}><p>Phi-Plugin</p></div><div class="ver" ${semantic("插件版本", ".ver")}><p> v1.0.2</p></div></div>`;

function stripPreviewImports(css: string) {
  return css
    .replace(/@import\s+[^;]+;/g, "")
    .replace(/@font-face\s*{[^}]*}/g, "");
}

const previewOnlyCss = `
@font-face { font-family: "PHI"; src: url(${JSON.stringify(defaultFontUrl())}) format("truetype"); font-display: swap; }
html { background: #171a1d; }
body {
  min-height: var(--phi-preview-height, 1400px);
  overflow: hidden;
  isolation: isolate;
  /* GrapesJS appends a white body background after protected CSS. */
  background: transparent !important;
}
.background { min-height: var(--phi-preview-height, 1400px); }
[data-phi-preview-hidden] { display: none !important; }
.createdbox { margin-top: 4%; margin-bottom: 4%; }
.createdbox p { font-size: 48px; }
:where(.average-marker) { bottom: ${previewHistogram.averagePosition}%; }
${previewHistogram.ticks.map((tick, index) => `:where(.histogram-grid-line:nth-child(${index + 1})) { bottom: ${tick.position}%; }`).join("\n")}
${previewHistogram.slots.map((slot, index) => `:where(.histogram-slot:nth-child(${index + 1}) .histogram-bar) { height: ${slot.height}%; }`).join("\n")}
`;

export const PROTECTED_CSS = `${stripPreviewImports(commonCss)}\n${stripPreviewImports(baseB19Css)}\n${DIFFICULTY_COLOR_CSS}\n${previewOnlyCss}`;

const TOGGLEABLE_SELECTOR = [
  "[data-phi-analysis]",
  "[data-phi-overflow]",
  "[data-phi-slot]",
  "[data-phi-optional]",
  "[data-phi-optional-not]",
].join(",");

function hiddenByPage(element: HTMLElement, page: PreviewPage) {
  if (element.hasAttribute("data-phi-analysis")) return page !== "analysis";
  if (element.hasAttribute("data-phi-overflow")) return page !== "b33";
  const slot = element.dataset.phiSlot;
  if (!slot) return false;
  const index = Number(element.dataset.phiIndex);
  const visible =
    page === "b19"
      ? slot === "phi" || (slot === "best" && index <= 16)
      : page === "b27"
        ? slot === "best" && index <= 27
        : page === "b33"
          ? slot === "phi" || (slot === "best" && index <= 33)
          : slot === "phi" || (slot === "best" && index <= 27);
  return !visible;
}

function hiddenByOption(element: HTMLElement, options: PreviewOptions) {
  const needs = element.dataset.phiOptional as PreviewOption | undefined;
  if (needs && !options[needs]) return true;
  const excludes = element.dataset.phiOptionalNot as PreviewOption | undefined;
  return Boolean(excludes && options[excludes]);
}

export function applyPreviewPage(
  document: Document,
  page: PreviewPage,
  options: PreviewOptions = DEFAULT_PREVIEW_OPTIONS,
) {
  document.documentElement.dataset.phiPreview = page;
  for (const element of document.querySelectorAll<HTMLElement>(
    TOGGLEABLE_SELECTOR,
  )) {
    const hidden =
      hiddenByPage(element, page) || hiddenByOption(element, options);
    element.toggleAttribute("data-phi-preview-hidden", hidden);
  }
  // These runtime state classes live on the DOM only. GrapesJS serializes its
  // component models, so preview-only classes never reach the exported theme.
  document
    .querySelector(".b30-analysis-row")
    ?.classList.toggle("histogram-wide", options.histogramWide);
  document
    .querySelector(".tag-analysis-body")
    ?.classList.toggle("is-insufficient", options.tagInsufficient);
}

/** Switch the visible branch of the shared setting/userSetting render target. */
export function applyUserSettingVariant(
  document: Document,
  variant: UserSettingVariant = DEFAULT_USER_SETTING_VARIANT,
) {
  document.documentElement.dataset.phiUserSettingVariant = variant;
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-phi-setting-variant]",
  )) {
    element.toggleAttribute(
      "data-phi-preview-hidden",
      element.dataset.phiSettingVariant !== variant,
    );
  }
}

/** Apply theme resources shared by every render target. */
export function applySharedRuntimePreview(
  document: Document,
  draft: ThemeDraft,
  resources: ThemeResources,
  assets: PackageAsset[],
  height?: number,
) {
  const byPath = new Map(assets.map((asset) => [asset.path, asset]));
  const background = resources.background
    ? byPath.get(resources.background)?.previewUrl
    : undefined;
  for (const backgroundImage of document.querySelectorAll<HTMLImageElement>(
    ".background img",
  )) {
    if (!backgroundImage.dataset.phiDefaultSrc) {
      backgroundImage.dataset.phiDefaultSrc =
        backgroundImage.getAttribute("src") || demoAssetUrl("background.png");
    }
    backgroundImage.src =
      background ||
      backgroundImage.dataset.phiDefaultSrc ||
      demoAssetUrl("background.png");
  }

  for (const image of document.querySelectorAll<HTMLImageElement>(
    "[data-rating], img[alt]",
  )) {
    const rating = (image.dataset.rating || image.alt || "") as RatingKey;
    if (!(RATING_KEYS as readonly string[]).includes(rating)) continue;
    const custom = resources.icons[rating]
      ? byPath.get(resources.icons[rating] || "")?.previewUrl
      : undefined;
    // Revert to the bundled demo icon when a custom asset is removed. This
    // matters because the old blob URL may already have been revoked.
    image.src = custom || demoAssetUrl(`rating/${rating}.png`);
  }

  let style = document.querySelector<HTMLStyleElement>("#phi-runtime-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "phi-runtime-theme";
    document.head.append(style);
  }
  const font = resources.font
    ? byPath.get(resources.font)?.previewUrl
    : undefined;
  const difficultyVariables = (Object.entries(draft.colors) as Array<[string, string]>)
    .map(([key, color]) => `--${key}: ${color}; --phi-theme-${key}: ${color}; --phi-theme-${key}-dark: color-mix(in srgb, ${color} 50%, black);`)
    .join(" ");
  style.textContent = `
    html:root { ${difficultyVariables}${height ? ` --phi-preview-height: ${height}px;` : ""} }
    ${font ? `@font-face { font-family: "phi-theme-preview"; src: url(${JSON.stringify(font)}); } body, body * { font-family: "phi-theme-preview", "PHI", sans-serif !important; }` : ""}
  `;
}

export function applyRuntimePreview(
  document: Document,
  draft: ThemeDraft,
  resources: ThemeResources,
  assets: PackageAsset[],
  page: PreviewPage = DEFAULT_PREVIEW_PAGE,
  options: PreviewOptions = DEFAULT_PREVIEW_OPTIONS,
) {
  applySharedRuntimePreview(document, draft, resources, assets, PREVIEW_PAGE_HEIGHTS[page]);
  applyPreviewPage(document, page, options);
}
