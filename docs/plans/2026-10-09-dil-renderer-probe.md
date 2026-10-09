# DIL 渲染器适配调研记录

**Source:** 2026-10-09 用户提供的四个真实 ChatGPT 会话；本机已登录 Chrome 的 DOM 与同源会话 API；仓库 `cd0715a`。真实目标只保存在被 Git 忽略的 `test-results/probes/2026-10-09/targets.json`。

**Goal:** 确认按钮消失与新回答格式的真实故障路径，为 Markdown 适配提供可验证的数据依据。

## 已完成的 probe

检查了四个页面，并在页面之间进行 SPA 切换。以下 A、B、C、D 对应本机目标文件中的标签，不包含真实会话标题或 ID。

| 样例 | 已验证的结果 |
| --- | --- |
| A | 已完成回答使用 `DilRenderer / DilResponseRoot`；有 26 个来源弹窗、9 个数学组件、8 个原生表格及图表、SVG、布局组件 |
| B | 普通 Markdown 回答，仍有 43 个 `data-testid="chatgpt-citation"`；直接加载时导出按钮正常 |
| C | 从 B 切换后，旧输入框保留且尺寸为 `0×0`，包含导出按钮；可见新输入框没有按钮 |
| D | 项目路由正常进入；切换到此会话时页面累积四个输入框，按钮仍在第一个隐藏输入框中 |

输入框选择器 `form[data-chatgpt-composer] [data-composer-surface-variant]` 仍命中。完成后的消息仍有 `[data-chatgpt-search-message-ids]`、`[data-chatgpt-selection-message-id]`、`[data-user-message-bubble]` 和 `[data-markdown-text-style="assistant-message"]`。

A 在生成期间暂时没有回答的 selection message ID；生成结束后出现。不能用生成中快照推导“新版已移除消息 ID”。产品仍只导出已完成回答。

### 隐藏工作区

隐藏祖先包含 `display: none` 的 `contents` 容器和工作区。切换会话保留旧 DOM，`isConnected` 仍为 true。当前代码有三条相关路径：

- `src/content.ts` 的 `composerContainer` 从整个文档取第一个匹配输入框，`syncRoute` 仅检查按钮是否连接 DOM。
- `src/selectors.ts` 的 `pageMessages` 没有排除隐藏工作区；消息身份和 `visibleBranchHints` 因而可能包含旧会话。
- 线上日志出现 `conversation-prefetch` / `页面中没有可导出的消息`。代码可以因隐藏旧消息触发预加载，再由 `extractVisibleConversation` 过滤掉这些消息，留下失败的首次预加载状态。

这是工作区生命周期问题；不能靠继续增加输入框 selector 修复。

### 新回答的结构化内容

在 A 中，用当前会话登录态读取现有 `/backend-api/conversation/{id}`，返回 **HTTP 200**，顶层包含 `mapping` 和 `current_node`。本轮没有证据要求迁移到复数 `/backend-api/conversations/{id}` 接口。浏览器确实使用复数接口，但其完整分支和分页语义没有在本轮验证。

可见最终回答通过 DOM message ID 精确匹配到 mapping 节点：

- `content.content_type` 为 `text`，`content.parts` 是字符串数组。
- 原始 parts 长度 23672，包含 `<Cite>`、`<FileCite>`、`<Chart>`、`<box>`、`<grid>` 等标记，不是可直接下载的纯 Markdown。
- `metadata.model_dil_v2` 的 keys 为 `code`、`constants`、`fallbackMarkdown`、`fallbackMarkdownVersion`、`recoveryDiagnostics`、`requiredComponents`、`clientDefinedWidgets`、`appData`。
- `fallbackMarkdownVersion` 为 **1**，`fallbackMarkdown` 长度 17052。它已经将主要布局转为文本，但仍含引用、图表控制标记和内联 SVG。
- API 还包含未在页面显示、且 `is_visually_hidden_from_conversation: true` 的回答节点。不能把所有 final 节点拼起来。

只读结构化字段即可取得需要的数据；不需要执行 `model_dil_v2.code`，也不需要读取 React 私有内部状态。

### 引用映射

回退 Markdown 中的控制字符分隔为：

```text
开始 U+E200；字段分隔 U+E202；结束 U+E201
cite      → 一个或多个 ref ID
filecite  → 文件 ref ID，后面可有行号范围
genui     → 图表组件内容标记
```

网页来源在 `metadata.model_dil_v2.appData.opGenui.componentResults`。字典 key 是组件实例 ID，不能直接当成引用 ID。已观察的来源记录如下，字段值为合成示例：

```json
{
  "status": "resolved",
  "componentName": "Cite",
  "state": {
    "items": [
      {
        "ref_id": "turn0search0",
        "refs": [{ "turn_index": 0, "ref_type": "search", "ref_index": 0 }],
        "title": "示例来源",
        "url": "https://example.com/source",
        "source_label": "example.com"
      }
    ],
    "active_index": 0,
    "sources_title": "Sources"
  }
}
```

A 的 componentResults 有 **17 个 Cite 和 5 个 FileCite**。回退 Markdown 有 **21 处网页引用标记**，其中每个 ref ID 均能关联到来源记录，缺失数量为 **0**。26 个 DOM 弹窗不等于 26 个唯一来源，也不等于组件记录数；实现不能按弹窗序号配对。

FileCite 的 `state` 包含 `refid`、`file_id`、`safe_file_url`、`file_name`、`file_type_label`、`file_action_payload`。本样例 `safe_file_url` 为 null，但有真实文件名；标记另有 `L27-L29` 形式的行号。无 URL 时保留可读附件名称，不能编造下载链接或复制私有 snippet。

新 DOM 的引用使用 `data-d-component="popover-trigger"`，正文没有 `a[href]` 和旧版 `chatgpt-citation`。来源映射应从 API 取得，不能靠域名、弹窗顺序或正文位置猜 URL。

### 公式、图表与图形

- 回退正文含 7 处 `\(` 行内公式和 2 处 `\[` 块公式；DOM 数学组件仍有保存 LaTeX 的 `annotation`。无需从屏幕上的数学字形反推公式。
- 表格仍是原生 `<table>`，新布局同时有 `data-d-component` 的 `text`、`title`、`box`、`row`、`grid`、`table`、`list`、`blockquote` 等组件。
- A 的 `metadata.content_references` 有一个 `type: "client_defined_widget"`、`category: "visualization"` 的记录。`data.language` 为 `recharts-json`，`data.widget_type` 为 `charts_widget_v2`。
- `data.content` 已是对象，包含 `chartType`、`meta`、`xKey`、`series`、`data`、`formattedData`、`axes`；本样例是 line chart、8 行数据。series 包含 `dataKey`、`label`、`valueSuffix`、`axisId`。
- 该记录的 `matched_text` **确实存在于 fallbackMarkdown 中**。转换时能在原位置替换为图表标题、描述和数据表；不能沿用原始 parts 的字符偏移替换不同长度的 fallbackMarkdown。
- fallbackMarkdown 仍有 `<svg>`、`<rect>`、`<text>`。其文本、说明与关联段落需在实施 probe 中逐项核对；原始 SVG 不应作为图片内嵌输出。

本轮未取得真实 DIL 代码块样例；不能声称新渲染器代码块已完成实战验证。计划将原有代码块回归与后续定向 probe 分开验收。

## 仓库复现与验证

- `npm test`：10 个测试文件、36 个测试全部通过。
- 对 `apiMessageFromNode` 运行与上述字段形状一致的合成 DIL probe，结果为 `usesFallback: false`、`leaksComponentMarkup: true`、`citations: 0`。
- `completeConversationFromPayload` 对已挂载消息优先保留 DOM 正文；`mergeVisibleMessage` 将 API 额外引用放到消息末尾。因此只修 API 的来源字典仍不足以恢复 DIL 正文中的脚注位置，必须同时定义正文优先级。
- `tests/e2e/fixture-client.ts` 的现有切换动作只改 URL 和标题，不保留/隐藏多个工作区，不能复现当前故障。

这些结果是调研与失败复现，不是适配完成或 E2E 通过的声明。

## 实施中的补充 probe

使用已有登录态，通过 `/api/auth/session` 取 Token 后读取单数会话 API，返回
HTTP 200。Token 不打印、不落盘。未带 authorization 的对照请求返回 404，
不能据此误判接口已经失效。

- `formattedData` 实际为 8 行数组，与原始 `data` 逐行对应；单元格已经带 `%`。
  转换按单元格优先使用该显示值，缺少时使用原始数据与 series 单位。
- `axes` 给出 y 轴范围和带 `%` 的刻度标签，仅用于图形坐标，不是额外的数据行。
- 实际 SVG 在 raw parts 中为图形标签；fallbackMarkdown 把它包装成 `svg` fence。
  序列化去掉排版空白并将 fontSize 等属性改成 kebab-case，但文字标签顺序一致。
  因此不能无条件保护该 fence，也不能把所有 SVG 代码示例转成图形。
- 实现用代码区域外 raw SVG 的可读标签识别 fallback 中的同一图形，不执行
  DIL code。SVG 代码示例与 inline code 仍保持原样。
- 真实节点仅保存在 Git 忽略目录。本地执行 `apiMessageFromNode` 和最终 renderer：
  结果 19288 个字符、26 个来源、8 行图表数据，图形标签完整，无未解析控制标记、
  SVG 源码或 Cite/FileCite/Chart/box/grid 标签。

该核验使用真实 payload，但尚未验证用户重载后的四会话完整 UI/下载流程。

### 实战追加的两种标记

用户重载后，C 的长会话首次导出显示“组件内容尚未支持”，没有产生残缺文件。
定向读取确认还有 `entity` 标记：字段是 JSON 数组 `[类型, 名称]`，页面正文展示
名称，Markdown 保留名称即可，不虚构链接。

用户追加样例 E 后，真实正文中另有 `url` 标记，字段依次为显示标题和 URL。
它是正文中的普通链接，不应改成来源脚注。补充 RED 测试后分别支持这两种标记，
并将其加入真实扩展使用的合成 fixture；代码区域中的字面量保持原样。

修复后对 C/E 实际 payload 的每条可导出消息进行本地转换：分别 16/9 条，
无未解析标记。真实文件及 URL 映射仍只保存在 Git 忽略目录。

C 第二次重载后，完整分支能进入 16/16 选择模式，但最终下载暴露来源标题为
null 的情况。补充 RED 后在 DIL 适配层归一化为空标题，由最终 renderer 使用
域名显示。之后将 C/E 的实际完整分支跑到最终 Markdown：16/9 条消息、
45/24 条脚注均成功，无控制标记。此项新增单元与真实扩展 fixture 下载覆盖。
