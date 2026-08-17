import commonPageCss from "../theme/pages/common-pages.css?raw";
import signCss from "../theme/pages/sign.css?raw";
import updateCss from "../theme/pages/update.css?raw";
import clgCss from "../theme/pages/clg.css?raw";
import arcgrosB19Css from "../theme/pages/arcgrosB19.css?raw";
import suggestCss from "../theme/pages/suggest.css?raw";
import tableCss from "../theme/pages/table.css?raw";
import listCss from "../theme/pages/list.css?raw";
import historyB30Css from "../theme/pages/historyB30.css?raw";
import settingCss from "../theme/pages/setting.css?raw";
import userSettingCss from "../theme/pages/userSetting.css?raw";
import difficultyHistoryCss from "../theme/pages/difficultyHistory.css?raw";
import helpCss from "../theme/pages/help.css?raw";
import userinfoCss from "../theme/pages/userinfo.css?raw";
import signMarkup from "../theme/pages/sign.html?raw";
import updateMarkup from "../theme/pages/update.html?raw";
import clgMarkup from "../theme/pages/clg.html?raw";
import arcgrosB19Markup from "../theme/pages/arcgrosB19.html?raw";
import suggestMarkup from "../theme/pages/suggest.html?raw";
import tableMarkup from "../theme/pages/table.html?raw";
import listMarkup from "../theme/pages/list.html?raw";
import historyB30Markup from "../theme/pages/historyB30.html?raw";
import settingMarkup from "../theme/pages/setting.html?raw";
import userSettingMarkup from "../theme/pages/userSetting.html?raw";
import difficultyHistoryMarkup from "../theme/pages/difficultyHistory.html?raw";
import helpMarkup from "../theme/pages/help.html?raw";
import userinfoMarkup from "../theme/pages/userinfo.html?raw";
import { PREVIEW_MARKUP, PROTECTED_CSS } from "./preview";
import { localizeMarkupComponentNames } from "./componentLabels";

/** Runtime render targets supported by the first multi-page editor tranche. */
export const RENDER_TARGETS = [
  "b19/b19",
  "sign/sign",
  "update/update",
  "clg/clg",
  "arcgrosB19/arcgrosB19",
  "suggest/suggest",
  "table/table",
  "list/list",
  "historyB30/historyB30",
  "userinfo/userinfo",
  "setting/setting",
  "setting/userSetting",
  "difficultyHistory/difficultyHistory",
  "help/help",
] as const;

export type RenderTarget = (typeof RENDER_TARGETS)[number];

/** The five conditional B19 canvases all edit the same b19/b19 target. */
export const B19_VIEW_IDS = ["b19", "b27", "b30", "b33", "analysis"] as const;
export type B19ViewId = (typeof B19_VIEW_IDS)[number];

export const B19_VIEW_TARGETS: Readonly<Record<B19ViewId, RenderTarget>> = {
  b19: "b19/b19",
  b27: "b19/b19",
  b30: "b19/b19",
  b33: "b19/b19",
  analysis: "b19/b19",
};

export interface PageCapability {
  /** The page is rendered as a CSS overlay over phi-plugin's original ArtTemplate. */
  cssOnly: boolean;
  /** Whether exporting a page-specific ArtTemplate is supported. */
  templateEditable: boolean;
  /** Whether the editor may append custom elements to this page. */
  customElements: boolean;
  /** Whether the runtime page consumes the global theme font/background/icon values. */
  sharedThemeResources: boolean;
}

export interface SelectorGroup {
  id: string;
  label: string;
  selectors: readonly string[];
  description?: string;
}

export interface PageDefinition {
  target: RenderTarget;
  app: string;
  template: string;
  label: string;
  markup: string;
  /** Sanitized page CSS; it contains no @import or remote resource URL. */
  baseCss: string;
  /** CSS that must be present in the canvas before page overrides. */
  protectedCss: string;
  /** Complete CSS string suitable for injecting into a preview iframe. */
  pageCssForPreview: string;
  width: number;
  height: number;
  selectorGroups: readonly SelectorGroup[];
  /** B19 view IDs shown by the existing editor; empty for standalone pages. */
  previewViews: readonly B19ViewId[];
  capabilities: PageCapability;
  /** Singular alias kept for integrations that use the original plan wording. */
  capability: PageCapability;
  /** Flat aliases make capability checks convenient in small integrations. */
  cssOnly: boolean;
  templateEditable: boolean;
  customElements: boolean;
  /** Source names are useful to diagnostics and do not affect package output. */
  fixtureFile: string;
  cssFile: string;
}

const B19_CAPABILITIES: PageCapability = Object.freeze({
  cssOnly: false,
  templateEditable: true,
  customElements: true,
  sharedThemeResources: true,
});

const OVERLAY_CAPABILITIES: PageCapability = Object.freeze({
  cssOnly: true,
  templateEditable: false,
  customElements: false,
  sharedThemeResources: true,
});

const BACKGROUND_SELECTOR_GROUP: SelectorGroup = {
  id: "background",
  label: "背景",
  selectors: [".background"],
  description: "页面背景层。",
};

const COMMON_FOOTER_SELECTOR_GROUP: SelectorGroup = {
  id: "footer",
  label: "页脚",
  selectors: [".createdbox", ".phi-plugin", ".ver"],
  description: "插件署名和版本信息。",
};

function selectorGroups(...groups: SelectorGroup[]): readonly SelectorGroup[] {
  return [BACKGROUND_SELECTOR_GROUP, COMMON_FOOTER_SELECTOR_GROUP, ...groups];
}

function selectorGroupsWithFooter(
  footer: SelectorGroup,
  ...groups: SelectorGroup[]
): readonly SelectorGroup[] {
  return [BACKGROUND_SELECTOR_GROUP, footer, ...groups];
}

/** Remove local/remote imports so a page can be injected as one safe stylesheet. */
function sanitizeCss(css: string) {
  return css
    .replace(/@import\s+[^;]+;/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:https?:|javascript:|data:)[^)]*\)/gi, "none")
    // Protocols are removed separately because quoted URLs may contain nested
    // parentheses (for example `javascript:alert(1)`).
    .replace(/\b(?:https?|javascript|data):/gi, "")
    .replace(/expression\s*\(/gi, "invalid(")
    .trim();
}

function pageCss(css: string) {
  const body = sanitizeCss(css);
  const frame = sanitizeCss(commonPageCss);
  return `${frame}\n\n${body}`.trim();
}

function fixtureMarkup(markup: string) {
  const base = (import.meta.env.BASE_URL || "/").endsWith("/")
    ? (import.meta.env.BASE_URL || "/")
    : `${import.meta.env.BASE_URL}/`;
  return localizeMarkupComponentNames(markup).replaceAll('src="/demo/', `src="${base}demo/`);
}

function definition(
  target: RenderTarget,
  label: string,
  markup: string,
  css: string,
  width: number,
  height: number,
  groups: readonly SelectorGroup[],
  fixtureFile: string,
  cssFile: string,
): PageDefinition {
  const overlayCss = pageCss(css);
  return {
    target,
    app: target.slice(0, target.indexOf("/")),
    template: target.slice(target.indexOf("/") + 1),
    label,
    markup: fixtureMarkup(markup.trim()),
    baseCss: overlayCss,
    protectedCss: sanitizeCss(commonPageCss),
    pageCssForPreview: overlayCss,
    width,
    height,
    selectorGroups: groups,
    previewViews: [],
    capabilities: OVERLAY_CAPABILITIES,
    capability: OVERLAY_CAPABILITIES,
    cssOnly: OVERLAY_CAPABILITIES.cssOnly,
    templateEditable: OVERLAY_CAPABILITIES.templateEditable,
    customElements: OVERLAY_CAPABILITIES.customElements,
    fixtureFile,
    cssFile,
  };
}

const b19SelectorGroups = selectorGroups(
  {
    id: "header",
    label: "玩家信息栏",
    selectors: [".title", ".playerInfo", ".playerId", ".rks", ".clgBox", ".date"],
  },
  {
    id: "scores",
    label: "成绩卡片",
    selectors: [".song", ".ill-box", ".ill", ".songname", ".Rating", ".chengji", ".acc", ".suggest"],
  },
  {
    id: "analysis",
    label: "B30 数据分析",
    selectors: [".b30-analysis-row", ".tag-analysis-panel", ".histogram-panel", ".average-marker"],
  },
);

const PAGE_DEFINITION_VALUES: readonly PageDefinition[] = [
  {
    target: "b19/b19",
    app: "b19",
    template: "b19",
    label: "B19 成绩图",
    markup: fixtureMarkup(PREVIEW_MARKUP.trim()),
    baseCss: PROTECTED_CSS.trim(),
    protectedCss: PROTECTED_CSS.trim(),
    pageCssForPreview: PROTECTED_CSS.trim(),
    width: 1200,
    height: 1960,
    selectorGroups: b19SelectorGroups,
    previewViews: B19_VIEW_IDS,
    capabilities: B19_CAPABILITIES,
    capability: B19_CAPABILITIES,
    cssOnly: B19_CAPABILITIES.cssOnly,
    templateEditable: B19_CAPABILITIES.templateEditable,
    customElements: B19_CAPABILITIES.customElements,
    fixtureFile: "src/editor/preview.ts#PREVIEW_MARKUP",
    cssFile: "src/editor/preview.ts#PROTECTED_CSS",
  },
  definition(
    "sign/sign",
    "每日签到",
    signMarkup,
    signCss,
    2048,
    1080,
    selectorGroups(
      { id: "player", label: "玩家信息", selectors: [".playerInfo", ".avatar", ".playerId", ".rks", ".clgBox", ".date", ".dataBox", ".spInfo"] },
      {
        id: "progress",
        label: "进度、任务与公告",
        selectors: [
          ".edgeProgress",
          ".edgeFill--EZ",
          ".edgeFill--HD",
          ".edgeFill--IN",
          ".edgeFill--AT",
          ".leftRail",
          ".luckCard",
          ".keyWordsCard",
          ".quoteCard",
          ".dailySongsPanel",
          ".panelHeader",
          ".songItem",
          ".songCover",
          ".songText",
          ".taskStatus",
          ".noticePanel",
          ".noticeBody",
          ".noticeNotice",
          ".noticeCalendar",
          ".noticeRow",
          ".noticeTitleRow",
          ".noticeTitle",
          ".noticeRowIndex",
          ".calendarTitle",
          ".calendarWeekHeader",
          ".calendarWeek",
          ".calendarCell",
          ".empty",
          ".signed",
          ".today",
        ],
      },
    ),
    "src/theme/pages/sign.html",
    "src/theme/pages/sign.css",
  ),
  definition(
    "update/update",
    "存档更新",
    updateMarkup,
    updateCss,
    800,
    931,
    selectorGroups(
      { id: "summary", label: "更新概览", selectors: [".title", ".title .r", ".Challenge", ".CLG", ".Challenge-r", ".rks_line", ".svg-box", ".value_box", ".line-box", ".line", ".date_box"] },
      {
        id: "records",
        label: "任务记录",
        selectors: [
          ".record_box",
          ".title_box",
          ".box_title",
          ".box_title-right-down",
          ".box_title-left",
          ".box_title-right",
          ".song_box",
          ".abox",
          ".imgbox",
          ".infobox",
          ".namebox",
          ".namebox_ed",
          ".namebox_un",
          ".songsname",
          ".new-box",
          ".songsinfo",
          ".songsinfo_ed",
          ".songsinfo_un",
          ".rank",
          ".score",
          ".acc",
          ".acc_1",
          ".acc_2",
          ".rks",
          ".coinbox",
          ".coinbox_un",
        ],
      },
      {
        id: "empty",
        label: "无更新占位",
        selectors: [
          ".Nosignal",
          ".Nosignal .border_corner_left_top",
          ".Nosignal .border_corner_right_top",
          ".Nosignal .border_corner_left_bottom",
          ".Nosignal .border_corner_right_bottom",
          ".Nosignal .line",
          ".Nosignal .timeout",
          ".Nosignal .client",
          ".Nosignal .sqrt",
        ],
      },
    ),
    "src/theme/pages/update.html",
    "src/theme/pages/update.css",
  ),
  definition(
    "clg/clg",
    "课题模式",
    clgMarkup,
    clgCss,
    1920,
    1200,
    selectorGroups(
      { id: "songs", label: "课题曲目", selectors: [".box", ".song-box", ".ill-box", ".ill", ".ill-shadow", ".info-box", ".song_name", ".dif"] },
      { id: "notes", label: "物量统计", selectors: [".notes-box", ".notes-info", ".notes_num", ".notes_title", ".tot-box", ".tot_clg"] },
    ),
    "src/theme/pages/clg.html",
    "src/theme/pages/clg.css",
  ),
  definition(
    "arcgrosB19/arcgrosB19",
    "Arcaea 风格 B19",
    arcgrosB19Markup,
    arcgrosB19Css,
    1200,
    1520,
    selectorGroupsWithFooter(
      {
        id: "footer",
        label: "页脚",
        selectors: [".arc_created", ".arc_created p"],
        description: "Arcaea 风格页脚署名。",
      },
      {
        id: "player",
        label: "玩家信息",
        selectors: [
          ".background img",
          ".phigros",
          ".phigros img",
          ".player",
          ".player_broad",
          ".player_broad img",
          ".player_idBox",
          ".player_id",
          ".player_id p",
          ".player_avatar",
          ".player_avatar img",
          ".player_rks",
          ".rks_broad",
          ".rks_num",
          ".rks_num p",
          ".rks_num p span",
          ".Challenge_broad",
          ".arcChallenge",
          ".arcChallenge p",
          ".date",
          ".date p",
          ".date_broad",
        ],
      },
      {
        id: "scores",
        label: "成绩卡片",
        selectors: [
          ".box",
          ".song_box",
          ".num_box",
          ".num",
          ".num p",
          ".num_broad",
          ".num_borad_bottom",
          ".difficulty_box",
          ".difficulty",
          ".difficulty p",
          ".acc_box",
          ".acc",
          ".acc p",
          ".borad_up",
          ".rks_box",
          ".ratingscore",
          ".ratingscore p",
          ".rks",
          ".rks p",
          ".line_box",
          ".line_left",
          ".square",
          ".line_right",
          ".rating_box",
          ".rating_borad",
          ".rating_box img",
          ".ill_box",
          ".ill_box img",
          ".score",
          ".score p",
          ".borad_down_box",
          ".borad_down",
          ".name",
          ".name p",
        ],
      },
      {
        id: "difficulty",
        label: "难度样式",
        selectors: [".AT-box", ".AT", ".IN-box", ".IN"],
      },
    ),
    "src/theme/pages/arcgrosB19.html",
    "src/theme/pages/arcgrosB19.css",
  ),
  definition(
    "suggest/suggest",
    "推分建议",
    suggestMarkup,
    suggestCss,
    1200,
    1206,
    selectorGroups(
      { id: "groups", label: "建议分组", selectors: [".head_title", ".group_list", ".group", ".group_title", ".row_box"] },
      { id: "rows", label: "建议曲目", selectors: [".line", ".song_name", ".num", ".song", ".dif", ".ill_box", ".info_box", ".down", ".acc", ".suggest", ".score_rating", ".rating"] },
    ),
    "src/theme/pages/suggest.html",
    "src/theme/pages/suggest.css",
  ),
  definition(
    "table/table",
    "定数表",
    tableMarkup,
    tableCss,
    960,
    2294,
    selectorGroups(
      { id: "heading", label: "表格标题", selectors: [".titleRow", ".title", ".phigrosTitle", ".title-line", ".titleDesc", ".phigrosVersion", ".queryDifficulty", ".qdBox", ".query", ".total", ".index"] },
      {
        id: "table",
        label: "表格内容",
        selectors: [
          ".tableBox",
          ".label",
          ".labelHead",
          ".heng",
          ".shu",
          ".line",
          ".labelContentBox",
          ".labelContent",
          ".content",
          ".song",
          ".ill",
          ".rank-box",
          ".rank",
          ".rankBlock",
        ],
      },
    ),
    "src/theme/pages/table.html",
    "src/theme/pages/table.css",
  ),
  definition(
    "list/list",
    "成绩列表",
    listMarkup,
    listCss,
    800,
    440,
    selectorGroups(
      { id: "heading", label: "列表标题", selectors: [".head_title", ".list_box"] },
      { id: "rows", label: "成绩行", selectors: [".line", ".song_name", ".num", ".song", ".dif", ".ill_box", ".info_box", ".down", ".acc", ".suggest", ".score_rating", ".score", ".rating"] },
    ),
    "src/theme/pages/list.html",
    "src/theme/pages/list.css",
  ),
  definition(
    "historyB30/historyB30",
    "B30 历史",
    historyB30Markup,
    historyB30Css,
    800,
    6547,
    selectorGroups(
      { id: "header", label: "玩家信息", selectors: [".title", ".playerInfo", ".avatar", ".playerId", ".rks", ".clgBox", ".date", ".dataBox"] },
      { id: "timeline", label: "历史时间线", selectors: [".descTip", ".main-box", ".row", ".date-box", ".upLine", ".midCirc", ".circInner", ".downLine", ".songs-box", ".row-date", ".underLine", ".s-song", ".ill-box", ".ill", ".levelKind", ".tag-box", ".changeTag", ".changeTagLine"] },
    ),
    "src/theme/pages/historyB30.html",
    "src/theme/pages/historyB30.css",
  ),
  definition(
    "userinfo/userinfo",
    "个人信息",
    userinfoMarkup,
    userinfoCss,
    1920,
    1500,
    selectorGroupsWithFooter(
      {
        id: "footer",
        label: "页脚",
        selectors: [".createdbox", ".phi-plugin", ".phi-plugin p", ".ver", ".ver p"],
        description: "插件署名和版本信息。",
      },
      {
        id: "player",
        label: "背景与玩家资料",
        selectors: [
          ".background img",
          ".left",
          ".Player_Info",
          ".Player_Info p",
          ".Player_Info-after",
          ".basic-box",
          ".basic-img",
          ".basic-img img",
          ".Player_Id",
          ".avatar",
          ".avatar img",
          ".Player_Id-box",
          ".Player_Id-left",
          ".Player_Id-left p",
          ".Player_Id-right",
          ".Player_Id-right p",
          ".left_title",
          ".left_title-left",
          ".left_title-left p",
          ".Player_data_line",
          ".Player_data_line-left",
          ".Player_data_line-right",
          ".Player_data_line-left .Player_data_title",
          ".Player_data_line-left .Player_data_title p",
          ".Player_data_line-right .Player_data_title",
          ".Player_data_line-right .Player_data_title p",
          ".Player_data_line-left .Player_data_value",
          ".Player_data_line-left .Player_data_value p",
          ".Player_data_line-right .Player_data_value",
          ".Player_data_line-right .Player_data_value p",
          ".Challenge",
          ".Challenge img",
          ".Challenge span",
          ".Player_data_box",
          ".Player_box_title",
          ".Player_box_title p",
          ".Player_box_value",
          ".Player_box_value p",
          ".Player_profile_box",
          ".Player_profile_box p",
        ],
      },
      {
        id: "charts",
        label: "玩家数据图表",
        selectors: [
          ".right",
          ".file-content",
          ".file-content-left",
          ".file-content-left p",
          ".data_title",
          ".data_title-left",
          ".data_title-left p",
          ".data_title p",
          ".svg-box",
          ".value_box",
          ".value_box p",
          ".line-box",
          ".line",
          ".line svg",
          ".line line",
          ".date_box",
          ".date_box p",
        ],
      },
      {
        id: "stats",
        label: "难度统计卡片",
        selectors: [
          ".stats-box",
          ".one-stats-box",
          ".rank",
          ".rank p",
          ".stats-up",
          ".Rating",
          ".Rating img",
          ".stats-group",
          ".stats-group-real",
          ".stats-group-real p",
          ".stats-group-tot",
          ".stats-group-tot p",
          ".stats-rating-group",
          ".rating-group",
          ".rating-value",
          ".rating-value p",
          ".rating-tatle",
          ".rating-tatle p",
          ".stats-score",
        ],
      },
    ),
    "src/theme/pages/userinfo.html",
    "src/theme/pages/userinfo.css",
  ),
  definition(
    "setting/setting",
    "插件设置",
    settingMarkup,
    settingCss,
    800,
    2200,
    selectorGroups(
      { id: "settings", label: "设置项", selectors: [".big-title", ".box", ".lineBox", ".line", ".square", ".left", ".title", ".info", ".right", ".space", ".drc", ".switch-true", ".switch-false", ".switchDrc-true", ".switchDrc-false"] },
    ),
    "src/theme/pages/setting.html",
    "src/theme/pages/setting.css",
  ),
  definition(
    "setting/userSetting",
    "用户设置",
    userSettingMarkup,
    userSettingCss,
    1080,
    1465,
    selectorGroups(
      { id: "panel", label: "设置面板", selectors: [".page-wrap", ".panel", ".title-box", ".page-title", ".page-desc"] },
      {
        id: "groups",
        label: "设置分组",
        selectors: [
          ".setting-theme",
          ".setting-b30AvgKind",
          ".setting-b30AvgColor",
          ".setting-allowApiUsage",
          ".setting-showB30Analysis",
          ".setting-allowDataCollection",
          ".setting-allowLeaderboard",
          ".setting-allowDataAggregation",
          ".setting-allowPlayerIdSearch",
          ".setting-allowUserIdSearch",
        ],
      },
      { id: "options", label: "设置选项", selectors: [".setting-head", ".setting-title", ".setting-current", ".setting-desc", ".option-row", ".option-card", ".option-title-line", ".option-title", ".option-tag", ".option-desc"] },
    ),
    "src/theme/pages/userSetting.html",
    "src/theme/pages/userSetting.css",
  ),
  definition(
    "difficultyHistory/difficultyHistory",
    "定数历史",
    difficultyHistoryMarkup,
    difficultyHistoryCss,
    2048,
    1031,
    selectorGroups(
      { id: "summary", label: "版本概览", selectors: [".header", ".ill-box", ".title-box", ".white-bar", ".title-content", ".title", ".content", ".chart-container"] },
      { id: "chart", label: "折线图", selectors: [".chart-axis", ".chart-ticks", ".chart-line", ".chart-point", ".chart-guide", ".chart-label"] },
      { id: "history", label: "定数变化", selectors: [".difficulty", ".a-box", ".dif-box", ".data-box", ".a-num", ".num-box", ".ver-box", ".update-ver", ".update-date"] },
    ),
    "src/theme/pages/difficultyHistory.html",
    "src/theme/pages/difficultyHistory.css",
  ),
  definition(
    "help/help",
    "帮助",
    helpMarkup,
    helpCss,
    1200,
    4237,
    selectorGroups(
      { id: "commands", label: "命令分组", selectors: [".help_box", ".help-group"] },
      { id: "rows", label: "命令列表", selectors: [".line", ".order", ".info_box", ".up", ".num", ".song", ".down", ".desc"] },
    ),
    "src/theme/pages/help.html",
    "src/theme/pages/help.css",
  ),
];

/** Immutable lookup table keyed by canonical `app/template` target. */
export const PAGE_DEFINITIONS: Readonly<Record<RenderTarget, PageDefinition>> = Object.freeze(
  Object.fromEntries(PAGE_DEFINITION_VALUES.map((page) => [page.target, page])) as Record<RenderTarget, PageDefinition>,
);

/** Backwards-compatible registry name for integrations that prefer a noun over definitions. */
export const PAGE_REGISTRY = PAGE_DEFINITIONS;

/** Stable ordered list for navigation UIs. */
export const PAGE_DEFINITION_LIST = PAGE_DEFINITION_VALUES;

const targetSet = new Set<string>(RENDER_TARGETS);
const viewSet = new Set<string>(B19_VIEW_IDS);
const aliases: Readonly<Record<string, RenderTarget>> = {
  b19: "b19/b19",
  "b19/b27": "b19/b19",
  "b19/b30": "b19/b19",
  "b19/b33": "b19/b19",
  "b19/analysis": "b19/b19",
  info: "userinfo/userinfo",
  userSetting: "setting/userSetting",
};

/**
 * Normalize a short app name, B19 preview view, or canonical target.
 * Unknown values return undefined so callers can show an explicit fallback.
 */
export function normalizeRenderTarget(value: string | null | undefined): RenderTarget | undefined {
  const input = value?.trim().replace(/\/+$/, "");
  if (!input) return undefined;
  if (targetSet.has(input)) return input as RenderTarget;
  if (viewSet.has(input)) return "b19/b19";
  const alias = aliases[input];
  if (alias) return alias;
  const short = `${input}/${input}`;
  return targetSet.has(short) ? short as RenderTarget : undefined;
}

export function getPageDefinition(target: string | null | undefined): PageDefinition | undefined {
  const normalized = normalizeRenderTarget(target);
  return normalized ? PAGE_DEFINITIONS[normalized] : undefined;
}

export function isRenderTarget(value: string | null | undefined): value is RenderTarget {
  return normalizeRenderTarget(value) !== undefined;
}

export function isB19ViewId(value: string | null | undefined): value is B19ViewId {
  return typeof value === "string" && viewSet.has(value);
}

/** Return the canonical page and view id used by a B19 navigation control. */
export function b19ViewTarget(view: string | null | undefined): { target: RenderTarget; view: B19ViewId } | undefined {
  if (!isB19ViewId(view)) return undefined;
  return { target: B19_VIEW_TARGETS[view], view };
}
