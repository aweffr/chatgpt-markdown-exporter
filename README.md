# ChatGPT Markdown 导出器

一个完全本地运行的 Chrome Manifest V3 扩展。
它在当前 ChatGPT 对话中提供逐条选择功能，并把所选消息下载为 Markdown 文件。

## 本地安装

```bash
npm install
npm run build
```

然后打开 `chrome://extensions`，启用“开发者模式”，
选择“加载已解压的扩展程序”，并选择本项目的 `dist` 目录。

## 使用

打开一个已保存的 ChatGPT 对话（包括 GPT 页面内的对话），点击输入框右侧的“导出”按钮。扩展会从
ChatGPT 当前会话数据中读取完整分支，因此即使长对话上方的消息已经不在页面
DOM 中，也会默认包含并选中；滚动到对应消息时可以逐条取消，也可以使用底部
工具栏全选、全不选、导出或取消。

下载文件名格式为 `{会话标题}-YYYY-MM-DD-HH-mm.md`。

扩展只生成 Markdown，不包含账户、付费墙、水印、遥测或第三方服务。

支持当前普通 Markdown 和 DIL 新渲染器回答：来源保留为正文脚注，公式保留
LaTeX，图表转成数据表，SVG 图形保留文字标签。图片和附件只保留链接；
没有下载地址的附件保留文件名。已知正文或来源缺失时会提示错误，不下载残缺文件。

## 开发验证

```bash
npm test
npm run typecheck
npm run build
```

浏览器回归使用实际扩展和合成页面，不需要登录 ChatGPT：

```bash
npm run build:e2e
npm run fixture
# 另一个终端执行
playwright-cli -s=exporter-dil open --config=.playwright/cli.config.json http://127.0.0.1:4173/c/fixture-conversation
playwright-cli -s=exporter-dil run-code --filename=tests/e2e/dil-export.js
```

测试使用独立 Chrome profile，文件通过原生下载流程保存到该 profile 的默认
下载目录；脚本从磁盘读取下载文件，验证选择、来源、公式、图表和会话切换。
真实会话样例与测试产物不加入 Git。
