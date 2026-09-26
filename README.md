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

## 开发验证

```bash
npm test
npm run typecheck
npm run build
```
