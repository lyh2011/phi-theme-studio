import { describe, expect, it } from "vitest";
import {
  B19_VIEW_IDS,
  PAGE_DEFINITION_LIST,
  PAGE_DEFINITIONS,
  RENDER_TARGETS,
  b19ViewTarget,
  getPageDefinition,
  isRenderTarget,
  normalizeRenderTarget,
} from "./pageRegistry";

describe("multi-page registry", () => {
  const runtimeSelector = /^(?:\.[A-Za-z_][\w-]*|[A-Za-z][\w-]*)(?:(?:\s+)(?:\.[A-Za-z_][\w-]*|[A-Za-z][\w-]*))*$/;

  it("registers every first-tranche render target", () => {
    expect(RENDER_TARGETS).toHaveLength(14);
    expect(PAGE_DEFINITION_LIST).toHaveLength(RENDER_TARGETS.length);
    for (const target of RENDER_TARGETS) {
      const page = PAGE_DEFINITIONS[target];
      expect(page.target).toBe(target);
      expect(page.markup).toContain("data-phi-selector");
      expect(page.width).toBeGreaterThan(0);
      expect(page.height).toBeGreaterThan(0);
      expect(page.baseCss).not.toMatch(/@import|javascript:|https?:/i);
      expect(page.selectorGroups.length).toBeGreaterThan(1);
      expect(page.selectorGroups.flatMap((group) => group.selectors)).not.toHaveLength(0);
      for (const selector of page.selectorGroups.flatMap((group) => group.selectors)) {
        expect(selector).toMatch(runtimeSelector);
        expect(page.markup).toContain(`data-phi-selector="${selector}"`);
      }
    }
  });

  it("keeps all B19 views on one canonical target", () => {
    expect(B19_VIEW_IDS).toEqual(["b19", "b27", "b30", "b33", "analysis"]);
    expect(PAGE_DEFINITIONS["b19/b19"].width).toBe(1200);
    for (const view of B19_VIEW_IDS) {
      expect(normalizeRenderTarget(view)).toBe("b19/b19");
      expect(b19ViewTarget(view)).toEqual({ target: "b19/b19", view });
    }
    expect(getPageDefinition("b19")?.target).toBe("b19/b19");
    expect(getPageDefinition("b19/b30")?.target).toBe("b19/b19");
  });

  it("normalizes short app names and rejects unknown pages", () => {
    expect(normalizeRenderTarget("sign")).toBe("sign/sign");
    expect(normalizeRenderTarget("setting/userSetting")).toBe("setting/userSetting");
    expect(normalizeRenderTarget("userSetting")).toBe("setting/userSetting");
    expect(normalizeRenderTarget("info")).toBe("userinfo/userinfo");
    expect(normalizeRenderTarget("userinfo")).toBe("userinfo/userinfo");
    expect(normalizeRenderTarget("missing-page")).toBeUndefined();
    expect(isRenderTarget("help")).toBe(true);
    expect(isRenderTarget("missing-page")).toBe(false);
  });

  it("marks standalone pages as CSS overlays and B19 as template-capable", () => {
    expect(PAGE_DEFINITIONS["b19/b19"].capabilities).toMatchObject({
      cssOnly: false,
      templateEditable: true,
      customElements: true,
    });
    expect(PAGE_DEFINITIONS["b19/b19"]).toMatchObject({
      cssOnly: false,
      templateEditable: true,
      customElements: true,
    });
    for (const page of PAGE_DEFINITION_LIST.filter((item) => item.target !== "b19/b19")) {
      expect(page.capabilities).toMatchObject({
        cssOnly: true,
        templateEditable: false,
        customElements: false,
      });
      expect(page.pageCssForPreview).toContain(".background");
    }
  });

  it("tracks the runtime class names used by edited page templates", () => {
    const update = PAGE_DEFINITIONS["update/update"].markup;
    expect(update).toContain('data-phi-selector=".line"');
    expect(update).toContain('data-phi-selector=".songsname"');
    expect(update).toContain('data-phi-selector=".namebox_ed"');
    expect(update).toContain('data-phi-selector=".songsinfo_un"');
    expect(update).toContain('data-phi-selector=".box_title-right-down"');
    expect(update).toContain('data-phi-selector=".acc_1"');
    expect(update).toContain('data-phi-selector=".acc_2"');
    expect(update).toContain('data-phi-selector=".Nosignal"');
    expect(update).not.toContain('data-phi-selector=".songname"');

    const table = PAGE_DEFINITIONS["table/table"].markup;
    for (const selector of [
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
    ]) {
      expect(table).toContain(`data-phi-selector="${selector}"`);
    }
    expect(table).not.toContain('data-phi-selector=".playerInfoRow"');
    expect(table).not.toContain('data-phi-selector=".score"');
    expect(table).not.toMatch(/class="(?:tableTitle|tableLine|difficulty)"/);

    const clg = PAGE_DEFINITIONS["clg/clg"].markup;
    expect(clg).toContain('data-phi-selector=".ill-shadow"');
    expect(clg).not.toContain('data-phi-selector=".charter-box"');

    const userinfo = PAGE_DEFINITIONS["userinfo/userinfo"].markup;
    expect(userinfo).toContain('class="background theme-background"');
    const userinfoSelectors = Array.from(
      userinfo.matchAll(/data-phi-selector="([^"]+)"/g),
      (match) => match[1],
    );
    expect(userinfoSelectors).toContain(".background img");
    expect(userinfoSelectors).toContain(".Challenge img");
    expect(userinfoSelectors).toContain(".line line");
    expect(userinfoSelectors).toContain(".stats-group-real");
    expect(userinfoSelectors.filter((selector) =>
      /(?:userinfo-page|rks-chart|data-history|acc-rks|limit-title|stats-title|unlock-group|total-score|acc-range)/.test(selector),
    )).toEqual([]);

    const sign = PAGE_DEFINITIONS["sign/sign"].markup;
    for (const selector of [
      ".edgeFill--AT",
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
    ]) {
      expect(sign).toContain(`data-phi-selector="${selector}"`);
    }

    const arcgros = PAGE_DEFINITIONS["arcgrosB19/arcgrosB19"];
    expect(arcgros.markup).toContain('data-phi-selector=".arc_created"');
    expect(arcgros.markup).toContain('data-phi-selector=".arc_created p"');
    expect(arcgros.markup).not.toContain('data-phi-selector=".createdbox"');
    expect(arcgros.selectorGroups.find((group) => group.id === "footer")?.selectors).toEqual([
      ".arc_created",
      ".arc_created p",
    ]);
    expect(arcgros.selectorGroups.find((group) => group.id === "player")?.selectors).toEqual([
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
    ]);
    expect(arcgros.selectorGroups.find((group) => group.id === "scores")?.selectors).toEqual([
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
    ]);
    expect(arcgros.selectorGroups.find((group) => group.id === "difficulty")?.selectors).toEqual([
      ".AT-box",
      ".AT",
      ".IN-box",
      ".IN",
    ]);
    expect(arcgros.height).toBe(1520);

    const tableDefinition = PAGE_DEFINITIONS["table/table"];
    expect(tableDefinition.height).toBe(2294);
    expect(tableDefinition.baseCss).toMatch(/body\s*\{[^}]*width:\s*960px;[^}]*height:\s*2294px/);
  });

  it("covers every runtime management setting field and its two dividers", () => {
    const setting = PAGE_DEFINITIONS["setting/setting"].markup;
    const fieldsAndTitles = Array.from(
      setting.matchAll(
        /class="lineBox" data-field="([^"]+)"[^>]*>[\s\S]*?<div class="title"[^>]*><p>([^<]*)<\/p>/g,
      ),
      (match) => [match[1], match[2]],
    );

    expect(setting.match(/class="lineBox(?: divider)?"/g) ?? []).toHaveLength(41);
    expect(setting.match(/class="lineBox divider"/g) ?? []).toHaveLength(2);
    expect(fieldsAndTitles).toEqual([
      ["renderScale", "渲染精度"],
      ["randerQuality", "渲染质量"],
      ["timeout", "渲染超时时间"],
      ["waitingTimeout", "等待超时时间"],
      ["renderNum", "并行渲染数量"],
      ["commentsAPage", "每页评论条数"],
      ["B19MaxNum", "B19最大限制"],
      ["HistoryDayNum", "历史成绩单日数量"],
      ["HistoryScoreDate", "历史成绩展示天数"],
      ["HistoryScoreNum", "历史成绩展示数量"],
      ["listScoreMaxNum", "/list 最大数量"],
      ["WordB19Img", "文字版B19曲绘图片"],
      ["WordSuggImg", "Suggest曲绘图片"],
      ["defaultGlobal", "默认使用国际服"],
      ["onLinePhiIllUrl", "在线曲绘来源"],
      ["githubProxy", "GitHub代理"],
      ["downIllUrl", "下载曲绘源"],
      ["watchInfoPath", "监听信息文件"],
      ["allowComment", "曲目评论"],
      ["autoPullPhiIll", "自动更新曲绘"],
      ["isGuild", "频道模式"],
      ["TapTapLoginQRcode", "绑定二维码"],
      ["cmdhead", "命令头"],
      ["openPhiPluginApi", "联合查分"],
      ["mutiNickWaitTimeOut", "多个曲目回复序号等待时长"],
      ["otherinfo", "曲库"],
      ["GuessTipCd", "提示间隔"],
      ["GuessTipRecall", "猜曲绘撤回"],
      ["LetterNum", "字母条数"],
      ["letterMarkdown", "开字母发送MD消息"],
      ["LetterIllustration", "发送曲绘"],
      ["LetterRevealCd", "字母提示间隔"],
      ["LetterGuessCd", "字母开启间隔"],
      ["LetterTipCd", "字母提示间隔"],
      ["LetterTimeLength", "猜字母待机时长"],
      ["GuessTipsTipCD", "提示冷却"],
      ["GuessTipsTipNum", "提示条数"],
      ["GuessTipsTimeout", "游戏时长"],
      ["GuessTipsAnsTime", "额外时间"],
    ]);
    expect(setting.match(/<p name="pvis">/g) ?? []).toHaveLength(28);
    expect(setting.match(/class="switch-(?:true|false)"/g) ?? []).toHaveLength(11);
    expect(setting).toContain('data-phi-selector=".switch-true"');
    expect(setting).toContain('data-phi-selector=".switch-false"');
    expect(setting).not.toContain("Use compact cards");
    expect(PAGE_DEFINITIONS["setting/setting"].height).toBe(2200);
  });

  it("covers every reachable user setting group and dynamic option", () => {
    const userSetting = PAGE_DEFINITIONS["setting/userSetting"].markup;
    const personalGroups = [
      ["setting-theme", "主题风格", 5],
      ["setting-b30AvgKind", "B30统计数据展示", 4],
      ["setting-b30AvgColor", "B30均值条配色", 4],
      ["setting-allowApiUsage", "API功能开关", 2],
      ["setting-showB30Analysis", "B30统计分析", 2],
    ] as const;
    const apiGroups = [
      ["setting-allowDataCollection", "数据收集同意", 2],
      ["setting-allowLeaderboard", "排行榜展示", 2],
      ["setting-allowDataAggregation", "数据聚合", 2],
      ["setting-allowPlayerIdSearch", "玩家ID搜索", 2],
      ["setting-allowUserIdSearch", "用户ID搜索", 2],
    ] as const;

    expect(userSetting.match(/class="setting-group setting-[^"]+"/g) ?? []).toHaveLength(10);
    expect(userSetting.match(/class="option-card(?: selected)?"/g) ?? []).toHaveLength(27);
    expect(userSetting.match(/class="option-card selected"/g) ?? []).toHaveLength(10);
    expect(userSetting.match(/data-phi-setting-variant="personal"/g) ?? []).toHaveLength(6);
    expect(userSetting.match(/data-phi-setting-variant="api"/g) ?? []).toHaveLength(6);
    expect(userSetting).not.toContain("setting-ratingIcon");

    for (const [className, title, optionCount] of [...personalGroups, ...apiGroups]) {
      const start = userSetting.indexOf(`class="setting-group ${className}"`);
      const next = userSetting.indexOf('class="setting-group setting-', start + 1);
      const groupMarkup = userSetting.slice(start, next === -1 ? undefined : next);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(groupMarkup).toContain(title);
      expect(groupMarkup.match(/class="option-card(?: selected)?"/g) ?? []).toHaveLength(optionCount);
      expect(groupMarkup.match(/class="option-card selected"/g) ?? []).toHaveLength(1);
    }
    expect(userSetting).toContain("Phi-Plugin API 用户设置");
    expect(userSetting).toContain("以下设置会同步到查分平台账户权限。");
    expect(PAGE_DEFINITIONS["setting/userSetting"].height).toBe(1465);
  });

  it("keeps the sign-in fixture content inside its declared canvas", () => {
    const sign = PAGE_DEFINITIONS["sign/sign"];
    expect(sign.height).toBe(1080);
    expect(sign.baseCss).toContain(".noticePanel");
    expect(sign.baseCss).toMatch(/\.noticePanel\s*\{[^}]*--top:\s*var\(--dashTop\)/);
  });
});
