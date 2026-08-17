import type { PackageAsset } from "../types/theme";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  md: "text/markdown",
  txt: "text/plain",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif";
export const FONT_ACCEPT =
  ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";

export function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function mimeFromPath(path: string) {
  return MIME_BY_EXTENSION[extensionOf(path)] || "application/octet-stream";
}

export function safeAssetPath(path: string) {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/")
  )
    return false;
  if (
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("%")
  )
    return false;
  return path
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}

export function normalizedAssetName(fileName: string, fallback: string) {
  const extension = extensionOf(fileName);
  const safeExtension = /^[a-z0-9]{2,5}$/.test(extension) ? extension : "bin";
  return `${fallback}.${safeExtension}`;
}

export async function assetFromFile(
  file: File,
  path: string,
): Promise<PackageAsset> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return hydrateAsset({ path, mime: file.type || mimeFromPath(path), bytes });
}

export function hydrateAsset(
  asset: Omit<PackageAsset, "previewUrl">,
): PackageAsset {
  const blob = new Blob([asset.bytes as BlobPart], { type: asset.mime });
  return { ...asset, previewUrl: URL.createObjectURL(blob) };
}

export function revokeAssets(assets: PackageAsset[]) {
  for (const asset of assets) URL.revokeObjectURL(asset.previewUrl);
}

export function replaceAsset(assets: PackageAsset[], next: PackageAsset) {
  const previous = assets.find((asset) => asset.path === next.path);
  if (previous) URL.revokeObjectURL(previous.previewUrl);
  return [...assets.filter((asset) => asset.path !== next.path), next];
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
