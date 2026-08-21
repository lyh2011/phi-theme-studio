import JSZip from "jszip";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import YAML from "yaml";
import { z } from "zod";
import {
  hydrateAsset,
  mimeFromPath,
  revokeAssets,
  safeAssetPath,
} from "./assets";
import {
  DIFFICULTY_COLOR_CSS,
  GENERATED_DIFFICULTY_COLORS_END,
  GENERATED_DIFFICULTY_COLORS_START,
} from "./difficultyColors";
import {
  GENERATED_BASE_STYLES_END,
  GENERATED_BASE_STYLES_START,
  inlinedBaseStyles,
} from "./baseStyles";
import {
  collectCustomClassNames,
  compactProjectData,
  templateForProject,
} from "../editor/customElements";
import {
  DEFAULT_DRAFT,
  DEFAULT_EXPORT_MODE,
  DEFAULT_RENDER_TARGET,
  DIFFICULTY_KEYS,
  EXPORT_MODES,
  RATING_KEYS,
  type PageCssMap,
  type PageCssMetadata,
  type RenderTarget,
  type ExportMode,
  type ImportedTheme,
  type PackageAsset,
  type StudioPageState,
  type StudioProjectFile,
  type ThemeDraft,
  type ThemeResources,
  type ValidationIssue,
} from "../types/theme";
import type { ProjectData } from "grapesjs";

const RESERVED_IDS = new Set([
  "default",
  "snow",
  "star",
  "dss2",
  "topText",
  "foolsDay",
]);
const ID_RE = /^[a-z][a-z0-9_-]*$/;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MAX_ZIP_SIZE = 50 * 1024 * 1024;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_SIZE = 50 * 1024 * 1024;
const MAX_TEXT_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 128;
const MAX_PROJECT_NODES = 5000;
const MAX_PROJECT_DEPTH = 64;
const PAGE_KEY_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/;
const RESERVED_PAGE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const RUNTIME_PACKAGE_PATHS = new Set([
  "info.yaml",
  "b19.css",
  "b19.art",
  "studio.json",
]);
const ALLOWED_EXTENSIONS = new Set([
  "yaml",
  "css",
  "art",
  "json",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "md",
  "txt",
  "pdf",
  "docx",
]);

const manifestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    Author: z.string().optional(),
    author: z.string().optional(),
    description: z.string().optional(),
    css: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    template: z.string().optional(),
    font: z.string().optional(),
    background: z.string().optional(),
    icon: z.record(z.string(), z.unknown()).optional(),
    color: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export interface ExportThemeInput {
  draft: ThemeDraft;
  resources: ThemeResources;
  assets: PackageAsset[];
  /** Legacy B19 stylesheet source. Kept as the primary field for old callers. */
  css: string;
  /** Per-page stylesheet sources keyed by `app` or `app/template`. */
  cssByPage?: PageCssMap;
  /** Optional package-relative paths for the per-page stylesheets. */
  cssPaths?: Record<string, string>;
  /** Optional v2 page editor states. Their CSS is merged with cssByPage. */
  pages?: Record<RenderTarget, StudioPageState>;
  /** Legacy single-CSS package shape; ignored by v2 page CSS maps. */
  exportMode?: ExportMode;
  customTemplate: string;
  templateSource?: string;
  projectData?: ProjectData;
}

/**
 * Return a canonical `app/template` render target. The plugin accepts a short
 * `app` key in manifests, but editor state is always stored under a canonical
 * target so exact/fallback resolution is deterministic.
 */
export function normalizeRenderTarget(value: string): RenderTarget | undefined {
  const trimmed = value.trim();
  if (trimmed !== value || !PAGE_KEY_RE.test(trimmed)) return undefined;
  return trimmed.includes("/") ? trimmed : `${trimmed}/${trimmed}`;
}

/** Return the app portion of a canonical or short render target. */
export function renderTargetApp(value: string): string | undefined {
  const normalized = normalizeRenderTarget(value);
  return normalized?.split("/", 1)[0];
}

/**
 * Resolve page CSS using the same precedence as phi-plugin's themeManager:
 * an exact `app/template` key wins over the short `app` fallback key.
 */
export function resolvePageCss(
  cssByPage: PageCssMap | undefined,
  target: string = DEFAULT_RENDER_TARGET,
): { css?: string; metadata?: PageCssMetadata } {
  const normalized = normalizeRenderTarget(target);
  if (!normalized) return {};
  const app = normalized.split("/", 1)[0];
  const exactKey = normalized;
  const exact = cssByPage?.[exactKey];
  if (typeof exact === "string") {
    return {
      css: exact,
      metadata: {
        target: normalized,
        key: exactKey,
        match: "exact",
      },
    };
  }
  const fallback = cssByPage?.[app];
  if (typeof fallback === "string") {
    return {
      css: fallback,
      metadata: {
        target: normalized,
        key: app,
        match: "fallback",
      },
    };
  }
  return {};
}

/** Describe the exact/short precedence encoded by a page CSS map. */
export function pageCssMetadataFor(
  cssByPage: PageCssMap | undefined,
  paths?: Record<string, string>,
): PageCssMetadata[] {
  return Object.keys(cssByPage || {})
    .filter((key) => isPageCssKey(key))
    .map((key) => {
      const target = normalizeRenderTarget(key) || DEFAULT_RENDER_TARGET;
      const app = target.split("/", 1)[0];
      const path = paths?.[key] ?? paths?.[target] ?? paths?.[app];
      return {
        target,
        key,
        match: key.includes("/") ? "exact" : "fallback",
        ...(path ? { path } : {}),
      };
    });
}

function isPageCssKey(value: string) {
  return !RESERVED_PAGE_KEYS.has(value) && Boolean(normalizeRenderTarget(value));
}

function pageCssFromInput(input: Pick<ExportThemeInput, "css" | "cssByPage" | "pages">) {
  const result: PageCssMap = {};
  if (typeof input.css === "string") {
    result[DEFAULT_RENDER_TARGET] = input.css;
  }
  for (const [key, css] of Object.entries(input.cssByPage || {})) {
    if (isPageCssKey(key) && typeof css === "string") {
      // An explicit map entry is authoritative over the legacy `css` field.
      if (normalizeRenderTarget(key) === DEFAULT_RENDER_TARGET && key !== DEFAULT_RENDER_TARGET) {
        delete result[DEFAULT_RENDER_TARGET];
      }
      result[key] = css;
    }
  }
  const pageTargetsByApp = new Map<string, Set<string>>();
  for (const target of Object.keys(input.pages || {})) {
    const canonical = normalizeRenderTarget(target);
    if (!canonical) continue;
    const app = canonical.split("/", 1)[0];
    const targets = pageTargetsByApp.get(app) || new Set<string>();
    targets.add(canonical);
    pageTargetsByApp.set(app, targets);
  }
  // A short fallback cannot represent two distinct templates. Keep exact
  // page states in that case, while retaining the compact short form when it
  // is the only configured template for an app.
  for (const [app, targets] of pageTargetsByApp) {
    if (targets.size > 1) delete result[app];
  }
  for (const [target, page] of Object.entries(input.pages || {})) {
    const key = target;
    if (isPageCssKey(key) && typeof page?.css === "string") {
      const canonical = normalizeRenderTarget(key);
      const app = renderTargetApp(key);
      // A v2 page state is canonical, while imported manifest maps retain the
      // original short key. Reuse that short key instead of emitting a second
      // stylesheet for the same page when it is the only configured variant.
      const hasExactMap = Boolean(
        canonical && typeof input.cssByPage?.[canonical] === "string",
      );
      const hasShortMap = Boolean(
        app && typeof input.cssByPage?.[app] === "string",
      );
      const canUseShortFallback = Boolean(app && (pageTargetsByApp.get(app)?.size || 0) <= 1);
      const isAppDefaultTemplate = Boolean(canonical && app && canonical === `${app}/${app}`);
      // Canonical page state is the editable source of truth. If a caller
      // supplies a short state (`pages.sign`) alongside an exact compatibility
      // map entry (`cssByPage['sign/sign']`), normalize the state onto the
      // exact key so export cannot create two files with contradictory CSS.
      const outputKey: string = canonical && hasExactMap
        ? canonical
        : canonical && hasShortMap && canUseShortFallback && isAppDefaultTemplate && key !== app
          ? app!
          : key;
      if (normalizeRenderTarget(outputKey) === DEFAULT_RENDER_TARGET && outputKey !== DEFAULT_RENDER_TARGET) {
        delete result[DEFAULT_RENDER_TARGET];
      }
      result[outputKey] = page.css;
    }
  }
  return result;
}

/**
 * Wrap the author's overrides into the stylesheet phi-plugin links instead of
 * its own b19.css, so the base layout has to come from one of these two routes.
 */
function packageImportPath(cssPath: string, target: string) {
  const depth = cssPath
    .split("/")
    .slice(0, -1)
    .filter(Boolean).length;
  return `${"../".repeat(depth)}${target}`;
}

export function packageCssFor(
  mode: ExportMode,
  overrides: string,
  cssPath = "b19.css",
) {
  const commonImport = packageImportPath(cssPath, "../../../common/common.css");
  const b19Import = packageImportPath(cssPath, "../../b19.css");
  const head =
    mode === "standalone"
      ? `@import "${commonImport}";\n\n${inlinedBaseStyles()}`
      : `@import "${b19Import}";`;
  return `${head}\n\n${DIFFICULTY_COLOR_CSS}\n\n${overrides}\n`;
}

/**
 * Package a page stylesheet. Legacy single-page B19 themes need to link the
 * plugin base stylesheet; v2 page maps are already injected after each page's
 * original CSS by phi-plugin and must contain only the theme overlay.
 */
export function packageCssForPage(
  mode: ExportMode,
  target: string,
  overrides: string,
  cssPath = "b19.css",
  includeBaseStyles = true,
) {
  if (includeBaseStyles && normalizeRenderTarget(target) === DEFAULT_RENDER_TARGET) {
    return packageCssFor(mode, overrides, cssPath);
  }
  return `${DIFFICULTY_COLOR_CSS}\n\n${overrides}\n`;
}

function pathExtension(path: string) {
  return path.split(".").pop()?.toLowerCase() || "";
}

function fileSizeLimit(path: string) {
  return ["yaml", "css", "art", "json", "md", "txt"].includes(
    pathExtension(path),
  )
    ? MAX_TEXT_SIZE
    : MAX_FILE_SIZE;
}

function fileSizeLabel(limit: number) {
  return `${limit / 1024 / 1024} MB`;
}

type ZipEntry = JSZip.JSZipObject & {
  _data?: { compressedSize?: number; uncompressedSize?: number };
};

function declaredUncompressedSize(entry: ZipEntry) {
  const size = entry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) && size >= 0
    ? size
    : undefined;
}

function declaredCompressedSize(entry: ZipEntry) {
  const size = entry._data?.compressedSize;
  return typeof size === "number" && Number.isFinite(size) && size >= 0
    ? size
    : undefined;
}

function normalizePackagePath(value: string) {
  const normalized = value.trim().replace(/^\.\//, "");
  return safeAssetPath(normalized) ? normalized : undefined;
}

function assertZipBudget(entries: ZipEntry[]) {
  let total = 0;
  for (const entry of entries) {
    const size = declaredUncompressedSize(entry);
    if (size === undefined) continue;
    const extension = pathExtension(entry.name);
    const limit = ["yaml", "css", "art", "json", "md", "txt"].includes(
      extension,
    )
      ? MAX_TEXT_SIZE
      : MAX_FILE_SIZE;
    if (size > limit) throw new Error(`文件解压后超过限制：${entry.name}`);
    total += size;
    if (total > MAX_TOTAL_UNCOMPRESSED_SIZE)
      throw new Error("ZIP 解压后总大小超过 50 MB");
    const compressed = declaredCompressedSize(entry);
    if (compressed && size > 1024 * 1024 && size / compressed > 1000) {
      throw new Error(`ZIP 压缩比异常，疑似压缩炸弹：${entry.name}`);
    }
  }
}

async function readEntryBytes(
  entry: ZipEntry,
  limit: number,
  label: string,
  budget: { total: number },
) {
  const bytes = await entry.async("uint8array");
  if (bytes.byteLength > limit) throw new Error(`文件解压后超过限制：${label}`);
  budget.total += bytes.byteLength;
  if (budget.total > MAX_TOTAL_UNCOMPRESSED_SIZE)
    throw new Error("ZIP 解压后总大小超过 50 MB");
  return bytes;
}

function normalizeCssUrl(url: string) {
  return decodeCssEscapes(url.trim().replace(/^(['"])(.*)\1$/, "$2"));
}

function isLocalCssFragment(url: string) {
  return url.startsWith("#");
}

function invalidCssUrl(url: string) {
  const normalized = url.replace(/^\.\//, "");
  if (/^(?:data|blob|https?|javascript|file):/i.test(normalized)) return true;
  try {
    return !safeAssetPath(decodeURIComponent(normalized));
  } catch {
    return true;
  }
}

function decodeCssEscapes(value: string) {
  return value
    .replace(/\\([0-9a-f]{1,6})(?:\s)?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) &&
        codePoint > 0 &&
        codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    })
    .replace(/\\([^\r\n])/g, "$1");
}

function isGeneratedSelector(selector: string) {
  // GrapesJS creates ids such as #i390l for components without a runtime class.
  return /(^|[^a-z0-9_-])#i[a-z0-9]{4,}(?=$|[^a-z0-9_-])/i.test(selector);
}

function walkAssetFunctions(
  nodes: valueParser.Node[],
  callback: (url: string) => void,
) {
  for (const node of nodes) {
    if (node.type !== "function") continue;
    const name = decodeCssEscapes(node.value).toLowerCase();
    if (name === "url") {
      callback(normalizeCssUrl(valueParser.stringify(node.nodes)));
      continue;
    }
    if (name === "image-set" || name === "-webkit-image-set") {
      let candidate: valueParser.Node | undefined;
      const flush = () => {
        if (!candidate) return;
        if (candidate.type === "string" || candidate.type === "word") {
          callback(normalizeCssUrl(valueParser.stringify(candidate)));
        }
        candidate = undefined;
      };
      for (const child of node.nodes) {
        if (child.type === "div" && child.value === ",") {
          flush();
        } else if (
          !candidate &&
          child.type !== "space" &&
          child.type !== "comment"
        ) {
          candidate = child;
        }
        if (child.type === "function") walkAssetFunctions([child], callback);
      }
      flush();
      continue;
    }
    walkAssetFunctions(node.nodes, callback);
  }
}

export function rewriteCssUrls(css: string, mapUrl: (url: string) => string) {
  const root = postcss.parse(css);
  root.walkDecls((declaration) => {
    declaration.value = rewriteCssValueUrls(declaration.value, mapUrl);
  });
  return root.toString();
}

/** Return resource URLs referenced by parsed CSS declarations. */
export function collectCssAssetUrls(css: string) {
  const urls = new Set<string>();
  const root = postcss.parse(css);
  root.walkDecls((declaration) => {
    walkAssetFunctions(valueParser(declaration.value).nodes, (url) => {
      if (!isLocalCssFragment(url)) urls.add(url);
    });
  });
  return urls;
}

function packageRelativeAssetPath(cssPath: string, assetPath: string) {
  const directory = cssPath.split("/").slice(0, -1).filter(Boolean);
  const asset = assetPath.replace(/^\.\//, "").split("/").filter(Boolean);
  let common = 0;
  while (common < directory.length && common < asset.length && directory[common] === asset[common]) {
    common += 1;
  }
  return [
    ...Array.from({ length: directory.length - common }, () => ".."),
    ...asset.slice(common),
  ].join("/") || assetPath;
}

function packageCssForPath(
  css: string,
  cssPath: string,
  urlToPath: Map<string, string>,
  assetPaths: Set<string>,
) {
  return rewriteCssUrls(css, (url) => {
    const assetPath = urlToPath.get(url) || url;
    return assetPaths.has(assetPath)
      ? packageRelativeAssetPath(cssPath, assetPath)
      : assetPath;
  });
}

function resolvePackageAssetPath(cssPath: string, url: string, assetPaths: Set<string>) {
  const direct = url.replace(/^\.\//, "");
  if (assetPaths.has(direct)) return direct;
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) return url;
  const directory = cssPath.split("/").slice(0, -1).filter(Boolean);
  const parts = [...directory, ...url.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length) resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  const candidate = resolved.join("/");
  return assetPaths.has(candidate) ? candidate : url;
}

function canonicalizeImportedCss(
  css: string,
  cssPath: string,
  assetPaths: Set<string>,
) {
  return rewriteCssUrls(css, (url) => resolvePackageAssetPath(cssPath, url, assetPaths));
}

function rewriteCssValueUrls(value: string, mapUrl: (url: string) => string) {
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (
      node.type !== "function" ||
      decodeCssEscapes(node.value).toLowerCase() !== "url"
    )
      return;
    const original = normalizeCssUrl(valueParser.stringify(node.nodes));
    const mapped = mapUrl(original);
    node.nodes = [
      {
        type: "word",
        value: JSON.stringify(mapped),
        sourceIndex: 0,
        sourceEndIndex: mapped.length,
      },
    ];
  });
  return parsed.toString();
}

const GENERATED_BLOCKS = [
  [GENERATED_DIFFICULTY_COLORS_START, GENERATED_DIFFICULTY_COLORS_END],
  [GENERATED_BASE_STYLES_START, GENERATED_BASE_STYLES_END],
] as const;

/**
 * Strip everything the studio generated (difficulty colors and, in standalone
 * mode, the inlined phi-plugin base stylesheet) so only the author's own
 * overrides are loaded back into the editor.
 */
export function cleanImportedCss(css: string) {
  const root = postcss.parse(css);
  let openBlock: string | undefined;
  root.each((node) => {
    const comment = node.type === "comment" ? node.text.trim() : undefined;
    if (comment && !openBlock) {
      const block = GENERATED_BLOCKS.find(([start]) => start === comment);
      if (block) {
        openBlock = block[1];
        node.remove();
        return;
      }
    }
    if (!openBlock) return;
    if (comment === openBlock) openBlock = undefined;
    node.remove();
  });
  root.walkAtRules("import", (rule) => {
    const value = rule.params.replace(/['"\s]/g, "");
    if (value.endsWith("b19.css") || value.endsWith("common.css"))
      rule.remove();
  });
  return root.toString().trim();
}

/** Packages that inline the base stylesheet are re-imported in standalone mode. */
export function detectExportMode(css: string): ExportMode {
  return css.includes(GENERATED_BASE_STYLES_START) ? "standalone" : "override";
}

export function validateThemeCss(
  css: string,
  previewUrlToPath?: Map<string, string>,
) {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch (error) {
    throw new Error(
      `CSS 解析失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  root.walkAtRules("import", () => {
    throw new Error("覆盖样式中不能包含 @import，基础样式会在导出时自动加入。");
  });
  root.walkRules((rule) => {
    if (isGeneratedSelector(rule.selector)) {
      throw new Error(
        `CSS 选择器 ${rule.selector} 来自编辑器临时 ID，无法在 phi-plugin 模板中稳定匹配。请选择带有类名的组件。`,
      );
    }
  });
  root.walkDecls((declaration) => {
    if (/expression\s*\(|javascript\s*:/i.test(declaration.value)) {
      throw new Error(`属性 ${declaration.prop} 包含不安全的表达式。`);
    }
    const parsed = valueParser(declaration.value);
    walkAssetFunctions(parsed.nodes, (url) => {
      // SVG paint servers, filters and markers use same-document fragments.
      // They are DOM references rather than files in the theme package.
      if (isLocalCssFragment(url)) return;
      const path = previewUrlToPath?.get(url) || url;
      if (invalidCssUrl(path)) throw new Error(`CSS 资源路径不安全：${url}`);
      if (
        previewUrlToPath &&
        !previewUrlToPath.has(url) &&
        !previewUrlToPath.has(path)
      ) {
        throw new Error(`CSS 引用了主题包中不存在的资源：${url}`);
      }
    });
  });
  return root.toString().trim();
}

function mapStringsDeep(
  value: unknown,
  replacements: Map<string, string>,
  key = "",
  styleValue = false,
): unknown {
  if (typeof value === "string") {
    if (replacements.has(value)) return replacements.get(value);
    if (styleValue || (key === "value" && value.includes("url("))) {
      return rewriteCssValueUrls(value, (url) => replacements.get(url) || url);
    }
    if (key === "cssText") {
      try {
        return rewriteCssUrls(value, (url) => replacements.get(url) || url);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) =>
      mapStringsDeep(item, replacements, key, styleValue),
    );
  if (value && typeof value === "object") {
    const childIsStyleValue = styleValue || key === "style";
    return Object.fromEntries(
      Object.entries(value).map(([childKey, item]) => [
        childKey,
        mapStringsDeep(item, replacements, childKey, childIsStyleValue),
      ]),
    );
  }
  return value;
}

function collectProjectUrls(
  value: unknown,
  urls: Set<string>,
  key = "",
  styleValue = false,
) {
  if (typeof value === "string") {
    if (/^(?:blob:|assets\/|\.\/assets\/)/.test(value)) urls.add(value);
    if (styleValue || (key === "value" && value.includes("url("))) {
      walkAssetFunctions(valueParser(value).nodes, (url) => urls.add(url));
    } else if (key === "cssText") {
      try {
        const root = postcss.parse(value);
        root.walkDecls((declaration) =>
          walkAssetFunctions(valueParser(declaration.value).nodes, (url) =>
            urls.add(url),
          ),
        );
      } catch {
        // Invalid transient editor values are reported by validateThemeCss when exported as CSS.
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectProjectUrls(item, urls, key, styleValue);
    return;
  }
  if (value && typeof value === "object") {
    const childIsStyleValue = styleValue || key === "style";
    for (const [childKey, item] of Object.entries(value)) {
      collectProjectUrls(item, urls, childKey, childIsStyleValue);
    }
  }
}

/** Return direct asset and CSS URL references found in GrapesJS project data. */
export function collectProjectAssetUrls(projectData: ProjectData) {
  const urls = new Set<string>();
  collectProjectUrls(projectData, urls);
  return urls;
}

const DANGEROUS_PROJECT_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "script",
  "script-props",
  "scriptProps",
  "scriptExport",
  "script-export",
  "javascript",
  "event",
  "events",
]);

function validateProjectValue(
  value: unknown,
  depth: number,
  state: { nodes: number },
  key = "",
): unknown {
  if (depth > MAX_PROJECT_DEPTH)
    throw new Error("studio.json 工程嵌套层级过深");
  if (typeof value === "string") {
    if (/<\s*script\b|javascript\s*:|data\s*:\s*text\/html/i.test(value)) {
      throw new Error(`studio.json 字段 ${key || "value"} 包含不安全内容`);
    }
    return value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value))
    return value.map((item) =>
      validateProjectValue(item, depth + 1, state, key),
    );
  if (typeof value !== "object")
    throw new Error("studio.json 包含不支持的数据类型");
  state.nodes++;
  if (state.nodes > MAX_PROJECT_NODES)
    throw new Error("studio.json 工程对象数量过多");

  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (DANGEROUS_PROJECT_KEYS.has(childKey) || /^on[a-z]/i.test(childKey)) {
      throw new Error(`studio.json 包含禁止字段：${childKey}`);
    }
    if (
      childKey === "tagName" &&
      typeof childValue === "string" &&
      /^(script|iframe|object|embed|base|form)$/i.test(childValue)
    ) {
      throw new Error(`studio.json 包含禁止标签：${childValue}`);
    }
    if (
      childKey === "attributes" &&
      childValue &&
      typeof childValue === "object" &&
      !Array.isArray(childValue)
    ) {
      for (const [attribute, attributeValue] of Object.entries(childValue)) {
        if (/^on/i.test(attribute) || DANGEROUS_PROJECT_KEYS.has(attribute)) {
          throw new Error(`studio.json 包含禁止属性：${attribute}`);
        }
        if (
          typeof attributeValue === "string" &&
          /^(?:javascript|data\s*:\s*text\/html):/i.test(attributeValue.trim())
        ) {
          throw new Error(`studio.json 属性 ${attribute} 包含不安全 URL`);
        }
      }
    }
    result[childKey] = validateProjectValue(
      childValue,
      depth + 1,
      state,
      childKey,
    );
  }
  return result;
}

export function validateStudioProjectData(value: unknown): ProjectData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("studio.json 工程结构无效");
  const project = validateProjectValue(value, 0, { nodes: 0 }) as Record<
    string,
    unknown
  >;
  const pages = project.pages;
  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    pages.some((page) => !page || typeof page !== "object")
  ) {
    throw new Error("studio.json 缺少有效 pages");
  }
  for (const page of pages as Array<Record<string, unknown>>) {
    if (!Array.isArray(page.frames) || page.frames.length === 0)
      throw new Error("studio.json 缺少有效 frames");
    if (
      page.frames.some(
        (frame) =>
          !frame || typeof frame !== "object" || !("component" in frame),
      )
    ) {
      throw new Error("studio.json frame 结构无效");
    }
  }
  return project as ProjectData;
}

interface PageCssFile {
  key: string;
  css: string;
  path: string;
}

function defaultCssPathForKey(key: string) {
  const normalized = normalizeRenderTarget(key) || DEFAULT_RENDER_TARGET;
  if (key === "b19" || normalized === DEFAULT_RENDER_TARGET) return "b19.css";
  // Keep short keys readable and make exact keys collision-free while staying
  // within the flat theme directory convention used by phi-plugin.
  return `${key.replace(/[^a-zA-Z0-9_-]+/g, "-")}.css`;
}

function cssFilesForInput(input: Pick<ExportThemeInput, "css" | "cssByPage" | "pages" | "cssPaths">): PageCssFile[] {
  const cssByPage = pageCssFromInput(input);
  const files: PageCssFile[] = [];
  const usedPaths = new Set<string>();
  for (const [key, css] of Object.entries(cssByPage)) {
    const canonical = normalizeRenderTarget(key);
    const app = canonical ? canonical.split("/", 1)[0] : undefined;
    const requested = input.cssPaths?.[key] ??
      (canonical ? input.cssPaths?.[canonical] : undefined) ??
      (app ? input.cssPaths?.[app] : undefined);
    const normalizedRequested = requested === undefined
      ? undefined
      : normalizePackagePath(requested);
    // Keep an explicitly unsafe path visible to validation instead of silently
    // replacing it with a generated filename.
    const basePath = requested !== undefined
      ? (normalizedRequested || requested)
      : defaultCssPathForKey(key);
    let path = basePath;
    let suffix = 2;
    while (usedPaths.has(path) && requested === undefined) {
      const extension = path.endsWith(".css") ? ".css" : "";
      const stem = extension ? path.slice(0, -extension.length) : path;
      path = `${stem}-${suffix++}${extension}`;
    }
    usedPaths.add(path);
    files.push({ key, css, path });
  }
  return files;
}

function usesPageCssMap(
  input: Pick<ExportThemeInput, "css" | "cssByPage" | "pages" | "cssPaths">,
  cssFiles = cssFilesForInput(input),
) {
  return Boolean(
    (input.pages && Object.keys(input.pages).length) ||
    (input.cssByPage && Object.keys(input.cssByPage).length) ||
    (input.cssPaths && Object.keys(input.cssPaths).length) ||
    cssFiles.length > 1 ||
    cssFiles.some(
      (file) => file.key !== DEFAULT_RENDER_TARGET && file.key !== "b19",
    ),
  );
}

export function manifestFor(input: Omit<ExportThemeInput, "projectData">) {
  const manifest: Record<string, unknown> = {
    name: input.draft.name.trim(),
    id: input.draft.id.trim(),
  };
  if (input.draft.author.trim()) manifest.Author = input.draft.author.trim();
  if (input.draft.description.trim())
    manifest.description = input.draft.description.trim();
  if (input.resources.font) manifest.font = input.resources.font;
  if (input.resources.background)
    manifest.background = input.resources.background;
  const icons = Object.fromEntries(
    RATING_KEYS.flatMap((key) =>
      input.resources.icons[key] ? [[key, input.resources.icons[key]]] : [],
    ),
  );
  if (Object.keys(icons).length) manifest.icon = icons;
  manifest.color = Object.fromEntries(
    DIFFICULTY_KEYS.map((key) => [key, input.draft.colors[key]]),
  );
  const cssFiles = cssFilesForInput(input);
  const forceCssMap = Boolean(
    (input.cssByPage && Object.keys(input.cssByPage).length) ||
    (input.pages && Object.keys(input.pages).length) ||
    (input.cssPaths && Object.keys(input.cssPaths).length),
  );
  if (!forceCssMap && cssFiles.length <= 1 && cssFiles[0]?.key === DEFAULT_RENDER_TARGET) {
    manifest.css = cssFiles[0].path;
  } else if (!forceCssMap && cssFiles.length === 1 && cssFiles[0]?.key === "b19") {
    // Keep the compact legacy form for callers that explicitly use the short
    // B19 key and have no other page styles.
    manifest.css = cssFiles[0].path;
  } else if (cssFiles.length) {
    manifest.css = Object.fromEntries(cssFiles.map(({ key, path }) => [key, path]));
  } else {
    manifest.css = "b19.css";
  }
  if (input.customTemplate.trim()) manifest.template = "b19.art";
  return manifest;
}

export function manifestYaml(input: Omit<ExportThemeInput, "projectData">) {
  return YAML.stringify(manifestFor(input), { lineWidth: 0 });
}

export function mapProjectAssetUrls(
  projectData: ProjectData,
  replacements: Map<string, string>,
) {
  return mapStringsDeep(projectData, replacements) as ProjectData;
}

function normalizedTemplate(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

const CUSTOM_CLASS_RE =
  /(^|[^A-Za-z0-9_-])\.?(phi-custom-(?:text|rect|circle|line|triangle|image)-[A-Za-z0-9_-]+)(?=$|[^A-Za-z0-9_-])/g;

function referencedCustomClasses(selector: string) {
  return [...selector.matchAll(CUSTOM_CLASS_RE)].map((match) => match[2]);
}

function cleanOrphanedCustomCss(css: string, projectData: ProjectData) {
  const liveClasses = collectCustomClassNames(projectData);
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    const referenced = referencedCustomClasses(rule.selector);
    if (
      referenced.length &&
      referenced.some((className) => !liveClasses.has(className))
    )
      rule.remove();
  });
  return root.toString().trim();
}

function cleanOrphanedCustomProjectStyles(projectData: ProjectData) {
  const value = projectData as ProjectData & { styles?: unknown[] };
  if (!Array.isArray(value.styles)) return projectData;
  const liveClasses = collectCustomClassNames(projectData);
  value.styles = value.styles.filter((style) => {
    if (!style || typeof style !== "object") return true;
    const record = style as { selectors?: unknown[]; selectorsAdd?: unknown };
    const selectors = [
      ...(Array.isArray(record.selectors) ? record.selectors : []),
      ...(typeof record.selectorsAdd === "string" ? [record.selectorsAdd] : []),
    ];
    const referenced = selectors.flatMap((selector) => {
      if (typeof selector === "string")
        return referencedCustomClasses(selector);
      if (selector && typeof selector === "object" && "name" in selector) {
        const name = (selector as { name?: unknown }).name;
        return typeof name === "string" ? referencedCustomClasses(name) : [];
      }
      return [];
    });
    return (
      !referenced.length ||
      referenced.every((className) => liveClasses.has(className))
    );
  });
  return projectData;
}

export function validateThemeTemplate(
  template: string,
  assetPaths: ReadonlySet<string>,
) {
  const safeTemplate = template.trimEnd();
  const normalized = safeTemplate.trim();
  if (!normalized) return "";
  if (new TextEncoder().encode(safeTemplate).byteLength > MAX_TEXT_SIZE) {
    throw new Error("b19.art 超过 5 MB");
  }

  const attributePattern = /\b(?:src|href|poster)\s*=\s*(["'])([\s\S]*?)\1/gi;
  for (const match of normalized.matchAll(attributePattern)) {
    const value = match[2].trim();
    if (/^(?:blob|javascript|data\s*:\s*text\/html):/i.test(value)) {
      throw new Error(`b19.art 包含不可打包的资源 URL：${value}`);
    }
    const baseUrl = "{{themeInfo.baseUrl}}";
    if (!value.startsWith(baseUrl)) continue;
    const path = value.slice(baseUrl.length);
    // Dynamic ArtTemplate expressions are opaque administrator source. Static
    // package references can still be checked against the files in this ZIP.
    if (/[{}]/.test(path)) continue;
    if (!safeAssetPath(path)) {
      throw new Error(`b19.art 资源路径不安全：${path || "空路径"}`);
    }
    if (!assetPaths.has(path))
      throw new Error(`b19.art 引用了主题包中不存在的资源：${path}`);
  }
  return safeTemplate;
}

export function validateTheme(
  input: Omit<ExportThemeInput, "projectData">,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const id = input.draft.id.trim();
  if (!ID_RE.test(id)) {
    issues.push({
      level: "error",
      message: "ID 需以小写字母开头，仅使用小写字母、数字、-、_",
    });
  } else if (RESERVED_IDS.has(id)) {
    issues.push({
      level: "error",
      message: `ID ${id} 与 phi-plugin 内置主题冲突`,
    });
  } else {
    issues.push({ level: "success", message: "主题 ID 可用" });
  }
  if (!input.draft.name.trim())
    issues.push({ level: "error", message: "主题名称不能为空" });
  else issues.push({ level: "success", message: "主题元数据完整" });

  for (const key of DIFFICULTY_KEYS) {
    if (!COLOR_RE.test(input.draft.colors[key])) {
      issues.push({
        level: "error",
        message: `${key} 难度色不是有效的十六进制颜色`,
      });
    }
  }
  const assetPaths = new Set<string>();
  for (const asset of input.assets) {
    if (!safeAssetPath(asset.path)) {
      issues.push({ level: "error", message: `资源路径不安全：${asset.path}` });
    } else if (RUNTIME_PACKAGE_PATHS.has(asset.path)) {
      issues.push({
        level: "error",
        message: `资源路径与主题包内置文件冲突：${asset.path}`,
      });
    } else if (!ALLOWED_EXTENSIONS.has(pathExtension(asset.path))) {
      issues.push({
        level: "error",
        message: `不支持的资源文件类型：${asset.path}`,
      });
    }
    if (assetPaths.has(asset.path)) {
      issues.push({ level: "error", message: `资源路径重复：${asset.path}` });
    }
    assetPaths.add(asset.path);
    const limit = fileSizeLimit(asset.path);
    if (asset.bytes.byteLength > limit) {
      issues.push({
        level: "error",
        message: `资源文件超过 ${fileSizeLabel(limit)}：${asset.path}`,
      });
    }
  }
  for (const key of [
    ...Object.keys(input.cssByPage || {}),
    ...Object.keys(input.pages || {}),
    ...Object.keys(input.cssPaths || {}),
  ]) {
    if (!isPageCssKey(key)) {
      issues.push({ level: "error", message: `页面 CSS 键无效：${key}` });
    }
  }
  for (const [key, css] of Object.entries(input.cssByPage || {})) {
    if (isPageCssKey(key) && typeof css !== "string") {
      issues.push({ level: "error", message: `页面 CSS 内容无效：${key}` });
    }
  }
  for (const [key, state] of Object.entries(input.pages || {})) {
    if (isPageCssKey(key) && (!state || typeof state.css !== "string")) {
      issues.push({ level: "error", message: `页面 CSS 内容无效：${key}` });
    }
  }
  const cssFiles = cssFilesForInput(input);
  const isV2 = usesPageCssMap(input, cssFiles);
  const cssFilePaths = new Set<string>();
  for (const file of cssFiles) {
    if (!normalizePackagePath(file.path)) {
      issues.push({ level: "error", message: `页面 CSS 路径不安全：${file.path}` });
    } else if (
      RUNTIME_PACKAGE_PATHS.has(file.path) &&
      !(file.path === "b19.css" && normalizeRenderTarget(file.key) === DEFAULT_RENDER_TARGET)
    ) {
      issues.push({ level: "error", message: `页面 CSS 路径与主题包内置文件冲突：${file.path}` });
    }
    if (cssFilePaths.has(file.path)) {
      issues.push({ level: "error", message: `页面 CSS 路径重复：${file.path}` });
    }
    if (assetPaths.has(file.path)) {
      issues.push({ level: "error", message: `页面 CSS 路径与资源冲突：${file.path}` });
    }
    cssFilePaths.add(file.path);
  }
  // info.yaml + studio.json + one file per page (+ optional b19.art).
  const runtimeFileCount = 2 + cssFiles.length + (input.customTemplate.trim() ? 1 : 0);
  if (input.assets.length + runtimeFileCount > MAX_FILES) {
    issues.push({ level: "error", message: `主题包文件数超过 ${MAX_FILES}` });
  }
  const references = [
    input.resources.background,
    input.resources.font,
    ...Object.values(input.resources.icons),
  ].filter((path): path is string => Boolean(path));
  for (const path of references) {
    if (!safeAssetPath(path))
      issues.push({ level: "error", message: `资源路径不安全：${path}` });
    else if (!assetPaths.has(path))
      issues.push({ level: "error", message: `缺少资源文件：${path}` });
  }
  const cssResources = new Map(
    input.assets.flatMap((asset) => [
      [asset.previewUrl, asset.path],
      [asset.path, asset.path],
      [`./${asset.path}`, asset.path],
    ]),
  );
  for (const [key, css] of Object.entries(pageCssFromInput(input))) {
    try {
      validateThemeCss(css, cssResources);
      issues.push({
        level: "success",
        message: Object.keys(pageCssFromInput(input)).length > 1
          ? `页面 CSS ${key} 可解析且资源路径安全`
          : "CSS 可解析且资源路径安全",
      });
    } catch (error) {
      issues.push({
        level: "error",
        message: `${key}：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  try {
    validateThemeTemplate(input.customTemplate, assetPaths);
  } catch (error) {
    issues.push({
      level: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  for (const [target, state] of Object.entries(input.pages || {})) {
    if (!state || typeof state !== "object") {
      issues.push({ level: "error", message: `页面状态无效：${target}` });
      continue;
    }
    if (state.customTemplate === undefined) continue;
    try {
      if (typeof state.customTemplate !== "string")
        throw new Error(`页面 ${target} 模板内容无效`);
      validateThemeTemplate(state.customTemplate, assetPaths);
    } catch (error) {
      issues.push({
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const bytes = input.assets.reduce(
    (total, asset) => total + asset.bytes.byteLength,
    0,
  );
  if (bytes > MAX_ZIP_SIZE)
    issues.push({ level: "error", message: "资源总大小超过 50 MB" });
  else if (bytes > 15 * 1024 * 1024)
    issues.push({
      level: "warning",
      message: "资源包超过 15 MB，Bot 首次渲染可能较慢",
    });
  if (input.customTemplate.trim()) {
    issues.push({
      level: "warning",
      message: "自定义 b19.art 将覆盖插件内置模板，请自行维护版本兼容性",
    });
  } else {
    issues.push({
      level: "success",
      message: "使用插件内置 B30 模板，可跟随上游结构更新",
    });
  }
  if (isV2) {
    issues.push({
      level: "success",
      message: "页面 CSS 仅导出主题覆盖层，由 phi-plugin 在原页面 CSS 后加载",
    });
  } else if ((input.exportMode ?? DEFAULT_EXPORT_MODE) === "standalone") {
    issues.push({
      level: "warning",
      message: "自包含样式表会固定当前基础布局，不再跟随 phi-plugin 更新",
    });
  } else {
    issues.push({
      level: "success",
      message: "覆盖模式只导出改动，基础样式跟随 phi-plugin 更新",
    });
  }
  return issues;
}

export async function exportThemePackage(input: ExportThemeInput) {
  const issues = validateTheme(input);
  const error = issues.find((issue) => issue.level === "error");
  if (error) throw new Error(error.message);

  const urlToPath = new Map(
    input.assets.flatMap((asset) => [
      [asset.previewUrl, asset.path],
      [asset.path, asset.path],
      [`./${asset.path}`, asset.path],
    ]),
  );
  const assetPaths = new Set(input.assets.map((asset) => asset.path));
  const safeTemplate = validateThemeTemplate(input.customTemplate, assetPaths);
  const sourcePageCss = pageCssFromInput(input);
  const b19Page = input.pages?.[DEFAULT_RENDER_TARGET] ||
    Object.entries(input.pages || {}).find(
      ([target]) => normalizeRenderTarget(target) === DEFAULT_RENDER_TARGET,
    )?.[1];
  const sourceProject = input.projectData || b19Page?.projectData;
  let projectData: ProjectData | undefined;
  if (sourceProject) {
    const safeProjectData = validateStudioProjectData(sourceProject);
    projectData = cleanOrphanedCustomProjectStyles(
      mapStringsDeep(safeProjectData, urlToPath) as ProjectData,
    );
  }

  const exportedCssByPage: PageCssMap = {};
  for (const [key, sourceCss] of Object.entries(sourcePageCss)) {
    const safeCss = validateThemeCss(sourceCss, urlToPath);
    // Custom elements are currently emitted only by B19. Other page CSS is
    // still validated and URL-rewritten, but has no template-side cleanup.
    const isB19 = normalizeRenderTarget(key) === DEFAULT_RENDER_TARGET;
    const cleanedCss = isB19 && projectData
      ? cleanOrphanedCustomCss(safeCss, projectData)
      : safeCss;
    exportedCssByPage[key] = rewriteCssUrls(
      cleanedCss,
      (url) => urlToPath.get(url) || url,
    );
  }
  const exportedCss = exportedCssByPage[DEFAULT_RENDER_TARGET] ||
    exportedCssByPage.b19 ||
    "";
  if (input.templateSource !== undefined) {
    if (!projectData) throw new Error("模板来源需要有效的 studio.json 工程数据");
    const rebuiltTemplate = templateForProject(
      input.templateSource,
      projectData,
      assetPaths,
    );
    if (
      normalizedTemplate(rebuiltTemplate) !== normalizedTemplate(safeTemplate)
    ) {
      throw new Error("模板来源与最终 b19.art 不一致");
    }
  }
  for (const page of Object.values(input.pages || {})) {
    if (!page.projectData || page.projectData === sourceProject) continue;
    const safePageProject = validateStudioProjectData(page.projectData);
    const mappedPageProject = mapStringsDeep(safePageProject, urlToPath) as ProjectData;
    const unresolvedProjectUrls = new Set<string>();
    collectProjectUrls(mappedPageProject, unresolvedProjectUrls);
    for (const url of unresolvedProjectUrls) {
      if (/^(?:blob:|\.\/assets\/)/.test(url))
        throw new Error(`工程包含未打包的资源引用：${url}`);
    }
  }
  if (projectData) {
    const unresolvedProjectUrls = new Set<string>();
    collectProjectUrls(projectData, unresolvedProjectUrls);
    for (const url of unresolvedProjectUrls) {
      if (/^(?:blob:|\.\/assets\/)/.test(url))
        throw new Error(`工程包含未打包的资源引用：${url}`);
    }
  }
  const cssFiles = cssFilesForInput(input).map((file) => ({
    ...file,
    css: exportedCssByPage[file.key] ?? "",
  }));
  const isV2 = usesPageCssMap(input, cssFiles);
  // Page-mapped packages have one runtime shape: every stylesheet is an
  // overlay. Keep ExportMode only for legacy single-CSS package compatibility.
  const exportMode = isV2
    ? DEFAULT_EXPORT_MODE
    : input.exportMode ?? DEFAULT_EXPORT_MODE;
  const pageStates: Record<string, StudioPageState> = {};
  for (const file of cssFiles) {
    const sourceState = Object.entries(input.pages || {}).find(
      ([target]) => target === file.key || normalizeRenderTarget(target) === normalizeRenderTarget(file.key),
    )?.[1];
    const stateProject = sourceState?.projectData
      ? mapStringsDeep(
        validateStudioProjectData(sourceState.projectData),
        urlToPath,
      ) as ProjectData
      : normalizeRenderTarget(file.key) === DEFAULT_RENDER_TARGET
        ? projectData
        : undefined;
    const compactStateProject = stateProject
      ? compactProjectData(stateProject)
      : undefined;
    pageStates[normalizeRenderTarget(file.key) || file.key] = {
      css: file.css,
      ...(compactStateProject ? { projectData: compactStateProject } : {}),
      ...(sourceState?.templateSource !== undefined
        ? { templateSource: sourceState.templateSource }
        : normalizeRenderTarget(file.key) === DEFAULT_RENDER_TARGET && input.templateSource !== undefined
          ? { templateSource: input.templateSource }
          : {}),
      ...(sourceState?.customTemplate !== undefined
        ? { customTemplate: sourceState.customTemplate }
        : {}),
      ...(sourceState?.dirty !== undefined ? { dirty: sourceState.dirty } : {}),
    };
  }
  const studioFile: StudioProjectFile = {
    schemaVersion: isV2 ? 2 : 1,
    generator: "phi-theme-studio",
    draft: input.draft,
    resources: input.resources,
    css: isV2 ? exportedCssByPage : exportedCss,
    exportMode,
    ...(input.templateSource !== undefined
      ? { templateSource: input.templateSource }
      : {}),
    ...(!isV2 && projectData
      ? { projectData: compactProjectData(projectData) }
      : {}),
    ...(isV2 ? { pages: pageStates } : {}),
  };

  const manifest = manifestYaml(input);
  const studioJson = JSON.stringify(studioFile, null, 2);
  const packageTemplate = safeTemplate ? `${safeTemplate}\n` : "";
  const packageCssFiles = cssFiles.map((file) => [
    file.path,
    packageCssForPath(
      packageCssForPage(exportMode, file.key, file.css, file.path, !isV2),
      file.path,
      urlToPath,
      assetPaths,
    ),
  ] as const);
  const textFiles: Array<readonly [string, string]> = [
    ["info.yaml", manifest],
    ...packageCssFiles,
    ["studio.json", studioJson],
    ...(packageTemplate ? [["b19.art", packageTemplate] as const] : []),
  ];
  let totalSize = input.assets.reduce(
    (total, asset) => total + asset.bytes.byteLength,
    0,
  );
  for (const [path, contents] of textFiles) {
    const size = new TextEncoder().encode(contents).byteLength;
    if (size > MAX_TEXT_SIZE)
      throw new Error(`${path} 超过 ${fileSizeLabel(MAX_TEXT_SIZE)}`);
    totalSize += size;
  }
  if (totalSize > MAX_TOTAL_UNCOMPRESSED_SIZE)
    throw new Error("主题包解压后总大小超过 50 MB");

  const zip = new JSZip();
  const root = zip.folder(input.draft.id.trim());
  if (!root) throw new Error("无法创建主题包目录");
  root.file("info.yaml", manifest);
  for (const [path, contents] of packageCssFiles) root.file(path, contents);
  root.file("studio.json", studioJson);
  if (packageTemplate) root.file("b19.art", packageTemplate);
  for (const asset of input.assets) root.file(asset.path, asset.bytes);
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (blob.size > MAX_ZIP_SIZE) throw new Error("生成的 ZIP 文件超过 50 MB");
  return blob;
}

function resolveRootPath(rootPrefix: string, path: string | undefined) {
  if (!path) return undefined;
  const normalized = normalizePackagePath(path);
  return normalized ? `${rootPrefix}${normalized}` : undefined;
}

export async function importThemePackage(file: File): Promise<ImportedTheme> {
  if (file.size > MAX_ZIP_SIZE) throw new Error("ZIP 文件超过 50 MB");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir,
  ) as ZipEntry[];
  if (entries.length > MAX_FILES)
    throw new Error(`主题包文件数超过 ${MAX_FILES}`);
  assertZipBudget(entries);
  for (const entry of entries) {
    const unsafeName = (entry as typeof entry & { unsafeOriginalName?: string })
      .unsafeOriginalName;
    const name = unsafeName || entry.name;
    if (!safeAssetPath(name)) throw new Error(`ZIP 包含不安全路径：${name}`);
  }
  const unsupportedEntries = entries.filter(
    (entry) => !ALLOWED_EXTENSIONS.has(pathExtension(entry.name)),
  );
  const unsupportedNames = new Set(unsupportedEntries.map((entry) => entry.name));
  const supportedEntries = entries.filter(
    (entry) => !unsupportedNames.has(entry.name),
  );
  const infoEntries = entries.filter(
    (entry) => entry.name.endsWith("/info.yaml") || entry.name === "info.yaml",
  );
  if (infoEntries.length !== 1)
    throw new Error("主题包必须且只能包含一个 info.yaml");
  const infoEntry = infoEntries[0];
  const rootPrefix = infoEntry.name.slice(0, -"info.yaml".length);
  if (rootPrefix && rootPrefix.split("/").filter(Boolean).length !== 1)
    throw new Error("主题包只能包含一个顶层主题目录");
  if (
    !rootPrefix &&
    supportedEntries.some((entry) => entry.name.includes("/"))
  ) {
    throw new Error("无顶层目录的主题包不能混入子目录文件");
  }
  for (const entry of supportedEntries) {
    if (!entry.name.startsWith(rootPrefix))
      throw new Error(`ZIP 文件不在主题根目录内：${entry.name}`);
    const relative = entry.name.slice(rootPrefix.length);
    if (!normalizePackagePath(relative))
      throw new Error(`ZIP 包含无效资源路径：${entry.name}`);
  }

  const budget = { total: 0 };
  const bytesCache = new Map<string, Uint8Array>();
  const readBytes = async (entry: ZipEntry, limit: number, label: string) => {
    const cached = bytesCache.get(entry.name);
    if (cached) return cached;
    const bytes = await readEntryBytes(entry, limit, label, budget);
    bytesCache.set(entry.name, bytes);
    return bytes;
  };
  const readText = async (entry: ZipEntry, limit: number, label: string) =>
    new TextDecoder().decode(await readBytes(entry, limit, label));

  const rawManifest = manifestSchema.parse(
    YAML.parse(await readText(infoEntry, MAX_TEXT_SIZE, infoEntry.name)),
  );
  const warnings: string[] = [];
  const manifestCssEntries: Array<{ key: string; path: string }> = [];
  if (typeof rawManifest.css === "string") {
    if (!normalizePackagePath(rawManifest.css)) {
      throw new Error(`info.yaml 包含不安全 css 路径：${rawManifest.css}`);
    }
    manifestCssEntries.push({ key: DEFAULT_RENDER_TARGET, path: normalizePackagePath(rawManifest.css)! });
  } else if (rawManifest.css && typeof rawManifest.css === "object") {
    for (const [key, value] of Object.entries(rawManifest.css)) {
      if (!isPageCssKey(key)) {
        warnings.push(`已忽略无效页面 CSS 键：${key}`);
        continue;
      }
      if (typeof value !== "string" || !normalizePackagePath(value)) {
        throw new Error(`info.yaml 包含不安全 css 路径：${key}`);
      }
      manifestCssEntries.push({ key, path: normalizePackagePath(value)! });
    }
  }
  if (!manifestCssEntries.length && rawManifest.css === undefined) {
    manifestCssEntries.push({ key: DEFAULT_RENDER_TARGET, path: "b19.css" });
  }
  const manifestCssPaths = new Set<string>();
  for (const entry of manifestCssEntries) {
    if (manifestCssPaths.has(entry.path)) {
      throw new Error(`info.yaml 页面 CSS 路径重复：${entry.path}`);
    }
    manifestCssPaths.add(entry.path);
  }
  if (rawManifest.template && !normalizePackagePath(rawManifest.template))
    throw new Error(`info.yaml 包含不安全 template 路径：${rawManifest.template}`);
  const inferredId =
    rootPrefix.split("/").filter(Boolean).pop() || "imported-theme";
  const id = rawManifest.id || inferredId;
  if (!ID_RE.test(id) || RESERVED_IDS.has(id))
    throw new Error(`info.yaml 中的主题 ID 不可用：${id}`);
  if (unsupportedEntries.length) {
    const shown = unsupportedEntries.slice(0, 3).map((entry) => entry.name);
    const remaining = unsupportedEntries.length - shown.length;
    warnings.push(
      `已忽略 ${unsupportedEntries.length} 个不支持的文件：${shown.join("、")}${remaining ? ` 等（另 ${remaining} 个）` : ""}`,
    );
  }
  if (rootPrefix && inferredId !== id)
    warnings.push("ZIP 顶层目录与主题 ID 不一致，导出时会自动规范化。");

  const colors = { ...DEFAULT_DRAFT.colors };
  for (const key of DIFFICULTY_KEYS) {
    const value = rawManifest.color?.[key];
    if (typeof value === "string" && COLOR_RE.test(value)) colors[key] = value;
  }
  const draft: ThemeDraft = {
    id,
    name: rawManifest.name || id,
    author: rawManifest.Author || rawManifest.author || "",
    description: rawManifest.description || "",
    colors,
  };
  const resources: ThemeResources = { icons: {} };
  if (rawManifest.background) resources.background = rawManifest.background;
  if (rawManifest.font) resources.font = rawManifest.font;
  for (const key of RATING_KEYS) {
    const value = rawManifest.icon?.[key];
    if (typeof value === "string") resources.icons[key] = value;
  }
  for (const path of [
    resources.background,
    resources.font,
    ...Object.values(resources.icons),
  ]) {
    if (path && !safeAssetPath(path))
      throw new Error(`info.yaml 包含不安全资源路径：${path}`);
  }
  const unsupportedPaths = new Set(
    unsupportedEntries
      .filter((entry) => entry.name.startsWith(rootPrefix))
      .map((entry) => entry.name.slice(rootPrefix.length)),
  );
  if (resources.background && unsupportedPaths.has(resources.background))
    delete resources.background;
  if (resources.font && unsupportedPaths.has(resources.font))
    delete resources.font;
  for (const key of RATING_KEYS) {
    const path = resources.icons[key];
    if (path && unsupportedPaths.has(path)) delete resources.icons[key];
  }

  const runtimeNames = new Set(
    [
      infoEntry.name,
      ...manifestCssEntries.map(({ path }) => resolveRootPath(rootPrefix, path)),
      resolveRootPath(rootPrefix, rawManifest.template),
      `${rootPrefix}studio.json`,
    ].filter((name): name is string => Boolean(name)),
  );
  const assets: PackageAsset[] = [];
  try {
    for (const entry of supportedEntries) {
      if (runtimeNames.has(entry.name)) continue;
      const bytes = await readBytes(entry, MAX_FILE_SIZE, entry.name);
      const relativePath = entry.name.slice(rootPrefix.length);
      assets.push(
        hydrateAsset({
          path: relativePath,
          mime: mimeFromPath(relativePath),
          bytes,
        }),
      );
    }

    const assetPaths = new Set(assets.map((asset) => asset.path));
    for (const path of [
      resources.background,
      resources.font,
      ...Object.values(resources.icons),
    ]) {
      if (path && !assetPaths.has(path))
        throw new Error(`主题包缺少 manifest 引用资源：${path}`);
    }

    const cssAssets = new Map(
      assets.flatMap((asset) => [
        [asset.path, asset.path],
        [`./${asset.path}`, asset.path],
      ]),
    );
    const cssByPage: PageCssMap = {};
    const pageCssMetadata: PageCssMetadata[] = [];
    let exportMode: ExportMode = DEFAULT_EXPORT_MODE;
    let foundCss = false;
    for (const { key, path } of manifestCssEntries) {
      const cssPath = resolveRootPath(rootPrefix, path);
      const cssEntry = cssPath && !unsupportedNames.has(cssPath)
        ? (zip.file(cssPath) as ZipEntry | null)
        : null;
      if (!cssEntry) {
        warnings.push(`主题包未包含页面 CSS：${key} (${path})`);
        continue;
      }
      const rawCss = await readText(cssEntry, MAX_TEXT_SIZE, cssEntry.name);
      const cleanCss = canonicalizeImportedCss(
        cleanImportedCss(rawCss),
        path,
        new Set(assets.map((asset) => asset.path)),
      );
      validateThemeCss(cleanCss, cssAssets);
      cssByPage[key] = cleanCss;
      foundCss = true;
      if (normalizeRenderTarget(key) === DEFAULT_RENDER_TARGET) {
        exportMode = detectExportMode(rawCss);
      }
      const normalizedKey = normalizeRenderTarget(key) || DEFAULT_RENDER_TARGET;
      pageCssMetadata.push({
        target: normalizedKey,
        key,
        match: key.includes("/") ? "exact" : "fallback",
        path,
      });
    }
    if (!foundCss) warnings.push("主题包未包含 CSS，将从空白覆盖样式开始。");
    const css = cssByPage[DEFAULT_RENDER_TARGET] || cssByPage.b19 || "";
    const templatePath = resolveRootPath(rootPrefix, rawManifest.template);
    const templateEntry = templatePath && !unsupportedNames.has(templatePath)
      ? (zip.file(templatePath) as ZipEntry | null)
      : null;
    let customTemplate = templateEntry
      ? await readText(templateEntry, MAX_TEXT_SIZE, templateEntry.name)
      : "";
    validateThemeTemplate(customTemplate, assetPaths);

    let projectData: ProjectData | undefined;
    let pages: Record<string, StudioPageState> | undefined;
    let safeB19Project: ProjectData | undefined;
    const studioEntry = zip.file(`${rootPrefix}studio.json`) as ZipEntry | null;
    if (studioEntry) {
      try {
        const studio = JSON.parse(
          await readText(studioEntry, MAX_TEXT_SIZE, studioEntry.name),
        ) as Partial<StudioProjectFile>;
        if (
          studio.generator !== "phi-theme-studio" ||
          (studio.schemaVersion !== 1 && studio.schemaVersion !== 2)
        ) {
          warnings.push("studio.json 版本不兼容，已按普通主题包导入。");
        } else {
          const pathToUrl = new Map(
            assets.map((asset) => [asset.path, asset.previewUrl]),
          );
          if (studio.schemaVersion === 1) {
            if (!studio.projectData) throw new Error("studio.json 缺少 projectData");
            if (
              typeof studio.css !== "string" ||
              validateThemeCss(studio.css) !== css
            ) {
              throw new Error("studio.json 工程样式与 b19.css 不一致");
            }
            const safeProject = validateStudioProjectData(studio.projectData);
            const mappedProject = mapStringsDeep(safeProject, pathToUrl) as ProjectData;
            projectData = mappedProject;
            if (studio.templateSource !== undefined) {
              if (typeof studio.templateSource !== "string")
                throw new Error("studio.json 模板来源无效");
              const rebuiltTemplate = templateForProject(
                studio.templateSource,
                safeProject,
                assetPaths,
              );
              if (
                normalizedTemplate(rebuiltTemplate) !==
                normalizedTemplate(customTemplate)
              ) {
                throw new Error("studio.json 模板来源与 b19.art 不一致");
              }
              customTemplate = studio.templateSource;
            }
          } else {
            if (!studio.pages || typeof studio.pages !== "object") {
              throw new Error("studio.json 缺少有效 pages");
            }
            if (
              studio.css !== undefined &&
              (typeof studio.css !== "object" || Array.isArray(studio.css))
            ) {
              throw new Error("studio.json v2 css 必须是页面映射");
            }
            if (studio.projectData !== undefined) {
              const safeProject = validateStudioProjectData(studio.projectData);
              safeB19Project = safeProject;
              projectData = mapStringsDeep(safeProject, pathToUrl) as ProjectData;
            }
            if (studio.css && typeof studio.css === "object" && !Array.isArray(studio.css)) {
              for (const [rawTarget, rawCss] of Object.entries(studio.css)) {
                if (typeof rawCss !== "string") {
                  throw new Error(`studio.json 页面 CSS 无效：${rawTarget}`);
                }
                const importedPageCss = cssByPage[rawTarget] ||
                  cssByPage[normalizeRenderTarget(rawTarget) || rawTarget];
                if (importedPageCss !== undefined && validateThemeCss(rawCss) !== importedPageCss) {
                  throw new Error(`studio.json 工程样式与 ${rawTarget} CSS 不一致`);
                }
              }
            }
            const safePages: Record<string, StudioPageState> = {};
            for (const [rawTarget, rawState] of Object.entries(studio.pages)) {
              const target = normalizeRenderTarget(rawTarget);
              if (!target || !rawState || typeof rawState !== "object") {
                throw new Error(`studio.json 页面状态无效：${rawTarget}`);
              }
              if (safePages[target]) {
                throw new Error(`studio.json 页面状态重复：${target}`);
              }
              const state = rawState as StudioPageState;
              if (typeof state.css !== "string") {
                throw new Error(`studio.json 页面 CSS 无效：${rawTarget}`);
              }
              const importedPageCss = cssByPage[rawTarget] ||
                cssByPage[target] ||
                resolvePageCss(cssByPage, target).css;
              if (importedPageCss !== undefined && validateThemeCss(state.css) !== importedPageCss) {
                throw new Error(`studio.json 工程样式与 ${rawTarget} CSS 不一致`);
              }
              const mappedState: StudioPageState = { css: state.css };
              if (state.projectData !== undefined) {
                const safeProject = validateStudioProjectData(state.projectData);
                mappedState.projectData = mapStringsDeep(safeProject, pathToUrl) as ProjectData;
                if (target === DEFAULT_RENDER_TARGET) {
                  safeB19Project = safeProject;
                  projectData = mappedState.projectData;
                }
              }
              if (state.templateSource !== undefined) {
                if (typeof state.templateSource !== "string")
                  throw new Error(`studio.json 模板来源无效：${rawTarget}`);
                validateThemeTemplate(state.templateSource, assetPaths);
                mappedState.templateSource = state.templateSource;
              }
              if (state.customTemplate !== undefined) {
                if (typeof state.customTemplate !== "string")
                  throw new Error(`studio.json 模板内容无效：${rawTarget}`);
                validateThemeTemplate(state.customTemplate, assetPaths);
                mappedState.customTemplate = state.customTemplate;
              }
              if (state.dirty !== undefined) mappedState.dirty = Boolean(state.dirty);
              safePages[target] = mappedState;
            }
            pages = safePages;
            const b19State = safePages[DEFAULT_RENDER_TARGET];
            const templateSource = b19State?.templateSource ?? studio.templateSource;
            if (templateSource !== undefined) {
              if (typeof templateSource !== "string")
                throw new Error("studio.json 模板来源无效");
              if (!projectData) throw new Error("studio.json B19 模板来源缺少工程数据");
              const rebuiltTemplate = templateForProject(
                templateSource,
                safeB19Project || projectData,
                assetPaths,
              );
              if (
                normalizedTemplate(rebuiltTemplate) !==
                normalizedTemplate(customTemplate)
              ) {
                throw new Error("studio.json 模板来源与 b19.art 不一致");
              }
              customTemplate = templateSource;
            }
          }
          if (
            typeof studio.exportMode === "string" &&
            (EXPORT_MODES as readonly string[]).includes(studio.exportMode)
          ) {
            exportMode = studio.exportMode as ExportMode;
          }
        }
      } catch (error) {
        // Treat studio metadata transactionally: a tampered page/project must
        // not leak a partially validated project into the ordinary theme import.
        projectData = undefined;
        pages = undefined;
        warnings.push(
          `studio.json 无法安全解析，已按普通主题包导入：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return {
      draft,
      resources,
      assets,
      css,
      cssByPage,
      pages,
      pageProjects: pages,
      pageCssMetadata,
      exportMode,
      customTemplate,
      projectData,
      warnings,
    };
  } catch (error) {
    revokeAssets(assets);
    throw error;
  }
}

export function cssForPreview(css: string, assets: PackageAsset[]) {
  const pathToUrl = new Map(
    assets.map((asset) => [asset.path, asset.previewUrl]),
  );
  return rewriteCssUrls(
    css,
    (url) => pathToUrl.get(url.replace(/^\.\//, "")) || url,
  );
}

/** Rewrite every page stylesheet to its hydrated asset preview URLs. */
export function cssMapForPreview(
  cssByPage: PageCssMap,
  assets: PackageAsset[],
) {
  return Object.fromEntries(
    Object.entries(cssByPage).map(([key, css]) => [key, cssForPreview(css, assets)]),
  ) as PageCssMap;
}
