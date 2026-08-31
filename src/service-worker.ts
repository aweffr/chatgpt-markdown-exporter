import {
  isDownloadRequest,
  markdownDataUrl,
  type DownloadResponse,
} from "./download";

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isDownloadRequest(message)) return false;

    const url = markdownDataUrl(message.markdown);
    void chrome.downloads
      .download({
        url,
        filename: message.filename,
        conflictAction: "uniquify",
        saveAs: false,
      })
      .then(() => sendResponse({ ok: true } satisfies DownloadResponse))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Markdown 下载失败",
        } satisfies DownloadResponse);
      });

    return true;
  },
);
