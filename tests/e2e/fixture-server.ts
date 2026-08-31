import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const fixtureHtml = await readFile(
  resolve(import.meta.dirname, "fixture.html"),
);
const fixtureClient = await readFile(
  resolve(projectRoot, "dist-e2e/fixture-client.js"),
);
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const port = Number(process.env.EXPORTER_FIXTURE_PORT ?? "4173");

const branch = {
  title: "导出测试对话",
  current_node: "assistant-2",
  mapping: {
    root: { id: "root", parent: null, children: ["user-1"] },
    "user-1": {
      id: "user-1",
      parent: "root",
      children: ["assistant-1"],
      message: {
        id: "user-1",
        author: { role: "user" },
        content: {
          content_type: "text",
          parts: ["请只导出我需要的消息。"],
        },
        metadata: {},
      },
    },
    "assistant-1": {
      id: "assistant-1",
      parent: "user-1",
      children: ["user-2"],
      message: {
        id: "assistant-1",
        author: { role: "assistant" },
        content: {
          content_type: "text",
          parts: ["第一条回答引用了 \uE200cite\uE202turn0search0\uE201。"],
        },
        recipient: "all",
        metadata: {
          model_slug: "gpt-5-6-thinking",
          content_references: [
            {
              type: "grouped_webpages",
              matched_text: "\uE200cite\uE202turn0search0\uE201",
              items: [{ title: "示例来源", url: "https://example.com/source" }],
            },
          ],
        },
      },
    },
    "user-2": {
      id: "user-2",
      parent: "assistant-1",
      children: ["assistant-2"],
      message: {
        id: "user-2",
        author: { role: "user" },
        content: { content_type: "text", parts: ["给我代码和表格。"] },
        metadata: {},
      },
    },
    "assistant-2": {
      id: "assistant-2",
      parent: "user-2",
      children: [],
      message: {
        id: "assistant-2",
        author: { role: "assistant" },
        content: {
          content_type: "text",
          parts: [
            "这是最终答案。\n\n```ts\nconst answer: number = 42;\n```\n\n| 项目 | 值 |\n| --- | --- |\n| 答案 | 42 |\n\n![示意图](/image.png)\n\n[报告附件](https://example.com/report.pdf)",
          ],
        },
        recipient: "all",
        metadata: { model_slug: "gpt-5-6-thinking" },
      },
    },
  },
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (url.pathname === "/fixture-client.js") {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
    });
    response.end(fixtureClient);
    return;
  }
  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname === "/image.png") {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(transparentPng);
    return;
  }
  if (url.pathname === "/api/auth/session") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken: "fixture-token" }));
    return;
  }
  if (url.pathname.startsWith("/backend-api/conversation/")) {
    if (
      url.pathname.endsWith("/api-fail") ||
      request.headers.authorization !== "Bearer fixture-token"
    ) {
      response.writeHead(503);
      response.end();
      return;
    }
    if (url.pathname.endsWith("/api-slow")) {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(branch));
      }, 2500);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    if (url.pathname.endsWith("/api-mismatch")) {
      response.end(
        JSON.stringify({
          ...branch,
          current_node: "assistant-1",
          mapping: {
            root: branch.mapping.root,
            "user-1": branch.mapping["user-1"],
            "assistant-1": { ...branch.mapping["assistant-1"], children: [] },
          },
        }),
      );
      return;
    }
    response.end(JSON.stringify(branch));
    return;
  }
  if (url.pathname === "/" || /(?:^|\/)c\//u.test(url.pathname)) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml);
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.info(`Fixture server listening on http://127.0.0.1:${port}`);
});
