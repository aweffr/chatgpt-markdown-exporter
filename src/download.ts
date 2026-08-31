import { markdownFilename } from "./markdown";

export interface DownloadRequest {
  type: "download-markdown";
  filename: string;
  markdown: string;
}

export interface DownloadResponse {
  ok: boolean;
  error?: string;
}

export function createDownloadRequest(
  title: string,
  markdown: string,
): DownloadRequest {
  return {
    type: "download-markdown",
    filename: markdownFilename(title),
    markdown,
  };
}

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  return (
    request.type === "download-markdown" &&
    typeof request.filename === "string" &&
    request.filename.endsWith(".md") &&
    request.filename.length > 3 &&
    typeof request.markdown === "string"
  );
}

export function markdownDataUrl(markdown: string): string {
  return `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
}
