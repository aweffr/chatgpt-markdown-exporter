# 当前工作区与 DIL Markdown 导出适配实施计划

**Source:** 用户 2026-10-09 明确要求新增 `DilRenderer / DilResponseRoot` 适配，并包含必要 probe、TDD 和实战 E2E；[已确认设计](2026-08-31-chatgpt-markdown-exporter-design.md)；[本轮调研与已验证 schema](2026-10-09-dil-renderer-probe.md)。

**Goal:** 在当前普通 Markdown 与 DIL 回答并存的 ChatGPT 中，输入框右侧持续显示导出按钮；只选择当前会话分支的消息；完整导出正文、原位置引用脚注、公式、图表数据及图片/附件链接。

**Status:** 已完成实施与验收。开发分支 `dev/dil-renderer`，先以 `7e7c128` 提交计划及 probe，再以 `adbe845` 提交实现；构建版本 `0.4.0`。53 个 unit、fixture E2E 和五个真实会话的实际下载均通过。原实施基线 `cd0715a`、版本 `0.3.0`。仓库根目录为 `/Users/aweffr/developer/aweffr/chatgpt-markdown-exporter`，下面命令从此目录执行。

## 方案和共享协议

### 数据来源选择

采用 **API 的 DIL fallbackMarkdown + 同一消息的结构化引用/组件数据**。DOM 负责当前工作区、消息身份、分支提示、控件和用户可见补充内容。已验证现有单数 conversation API 能返回完整 mapping，继续使用它。

备选方案是读取 DIL DOM、逐个打开引用弹窗并拼接内容。它依赖挂载状态和弹窗交互，难以覆盖已虚拟化的前文，也不能可靠恢复同域名多个来源的对应关系，因此不采用。另一种做法是直接导出 `content.parts`，实测会泄漏组件标记，也不采用。

普通 Markdown 是当前仍在使用的渲染路径，必须保留；不扩展对已经消失的历史页面结构的兼容。

### 工作区与加载协议

- 一个导出上下文对应当前 URL 会话及其当前可见工作区。按钮、消息、turn hints、生成状态和勾选框都使用同一个上下文，不能分别从整个 document 取第一个匹配节点。
- “可见工作区”指未被祖先隐藏的当前工作区；**不等于当前滚动视口**。屏幕外但仍挂载的消息不能被当作隐藏旧会话过滤掉，未挂载前文仍由 API 补全。
- 根据当前 thread composer 和其会话容器确定范围；优先使用已验证的语义属性，禁止依赖带构建哈希的完整 class 名。选择器继续集中管理。
- 旧节点 `isConnected` 不代表上下文仍有效。工作区或 composer 更换时把入口移到当前输入框，清理旧控件；没有已保存会话时移除入口。
- 路由切换退出选择模式；同分支 DOM 重建保持已选 ID。旧会话尚未完成的异步加载不得更新新会话的缓存或 UI。
- 未出现当前工作区消息属于尚未就绪，不能被隐藏旧消息触发并消耗本路由的预加载机会。当前会话就绪后才预加载；失败仍允许用户点击重试，不增加无界轮询请求。
- 保留现有 15 秒读取超时和 401 刷新一次策略。按钮挂载不等待 API。读取失败不得静默下载仅含页面尾部的文件。

### 内容与模块协议

- `src/conversation-client.ts` 负责会话读取；`src/selectors.ts` 与 `src/content.ts` 负责当前页面上下文；`src/api-message.ts` 负责消息类型分派；DIL 的纯数据转换放在独立模块（新增 `src/dil-message.ts`）；`src/conversation.ts` 负责分支、正文优先级和补充信息合并；`src/markdown.ts` 继续负责最终选中消息的脚注编号与输出。
- 保持 `ExportMessage` 的 `id / role / markdown / citations / model` 语义，保留 `createCitationToken` 作为内部引用协议。格式专有字段在适配层解决，不让选择状态、下载服务或最终 Markdown renderer 理解 DIL。
- DIL 由消息的 `metadata.model_dil_v2` 识别。已验证的 `fallbackMarkdownVersion: 1` 为此次支持协议；以其 fallbackMarkdown 为完整正文，包括没有 DOM 的消息。不得被已挂载 DOM 的不完整转换覆盖。
- 普通回答继续沿用现有 DOM 增强路径。两条路径都只通过 message ID 合并模型信息、引用回复和用户可见摘要，避免重复添加。隐藏回答、analysis 和工具内部输出保持现有排除规则。
- 不执行 DIL 的 `code`，不解析 React 私有状态，不引入第三方渲染服务。这里只做 Markdown 文本和已取回结构化数据的转换。
- 对已识别的 DIL，缺失必需回退正文、已出现引用无法解析或图表标记缺少必要数据，是明确的消息转换失败；显示简短行内错误，不下载已知缺失内容的文件。不要把失败变成空消息或成功的空引用列表。

### Markdown 输出协议

| 内容 | 输出结果与不变量 |
| --- | --- |
| 正文及布局 | 使用官方 fallbackMarkdown 的阅读顺序、段落、标题、列表、引用、强调和代码；不输出 box/grid 等实现标记，不追求页面像素布局 |
| 网页引用 | 按 fallbackMarkdown 的 cite 标记逐个匹配 `Cite.state.items[].ref_id`；一处多来源保留全部；在原位置插入内部 citation token，再由最终 renderer 编号 |
| 来源字典 | 只使用相同消息的 resolved Cite 记录；组件实例 ID 不是 ref ID，不能按组件顺序或域名配对；来源 URL 和标题遵循现有最终渲染规则 |
| 文件引用 | filecite ref 对应 `FileCite.state.refid`；有 `safe_file_url` 时输出带文件名的链接，没有时输出 `[附件：文件名]`；有行号则保留为可读范围，不复制内部 snippet |
| 公式 | 保留 LaTeX；将代码区域外的 `\(...\)` 和 `\[...\]` 分别转换为行内 `$...$` 与块级 `$$...$$`，不得修改代码中的同样字符 |
| 结构化图表 | 在 genui 标记位置精确关联 `charts_widget_v2`；按 xKey、series 顺序输出标题、描述及数据表；优先 formattedData 单元格（已经带单位），否则使用 raw data + valueSuffix；保留零值、负值，无值留空 |
| SVG 图形 | 转为原图已有的 title/desc/text；实测 fallback 将图形包装成 svg fence，只在其标签与 raw parts 代码区域外的 SVG 对应时转换；保留普通 SVG 代码示例，不内嵌图形或猜数值 |
| 图片与附件 | 沿用现有链接输出；不下载、不内嵌；无真实 URL 的附件保留名称 |
| 最终文档 | 用户标题为“用户”，模型版本有证据才附加；文件名仍为 `{标题}-YYYY-MM-DD-HH-mm.md`；引用按最终选中内容重新编号、按规范化 URL 去重；无水印与账户信息 |

图表和引用替换必须针对 fallbackMarkdown 中的精确标记，不能复用原始 parts 的 start/end 偏移。DIL 的标记解析必须尊重 fenced/inline code，不能把代码示例中的字面量当成正文组件。

### 测试纪律和证据

- 每项行为变更先新增能暴露实际回归的失败测试，记录 RED 命令与失败原因，再做最小实现并确认 GREEN，最后跑相关回归。文档、构建文件等机械变更不强行 TDD。
- 新 fixture 使用合成正文、ID、文件名和 `example.com` 链接，保留已验证的字段关系。真实 HTML、payload、HAR、下载文件和 URL 映射只放在 Git 忽略目录；不保存或打印 Token。
- 复用现有 Vitest、fixture server、`build:e2e` 和 Playwright CLI 配置。新增场景与可复跑脚本属于本计划的最小测试补充，不另建测试平台或诊断服务。
- Playwright CLI 在主机环境执行；E2E 通过与否依据可见按钮、勾选、计数、错误提示和实际下载内容。内部节点计数仅用于 probe 和定位问题。
- 实战测试必须使用本机已登录 Chrome。用户此前明确由自己重载扩展：实施完成后交付构建并等待用户重载，再跑实战验收；此前只能标为“自动化通过，实战待重载”，不能宣布实战已通过。

## Task 1 — 将真实结构转成可复现的适配契约

**Blocked by:** None

**Touchpoints:** `docs/plans/2026-10-09-dil-renderer-probe.md`；`src/types.ts`；`src/api-message.ts`；`src/conversation.ts`；`tests/e2e/fixture-server.ts`；新增 `tests/fixtures/dil/`；新增 `tests/probes/`。

**Protocol / Constraints**

- 以本轮已验证的 schema 为起点，补齐影响转换的定向 probe：同一 ref 重复出现、多来源、FileCite 行号、chart 的 formattedData/axes 与 series 的显示语义、SVG 可读标签、公式定界符和代码区域保护。
- 将 A 的每类可读正文内容与 fallbackMarkdown 对照，确保来源、公式、图表与图形文本位置一致。核对 B 普通路径以及 C/D 的完整分支和附件行为。
- 不重复无目的全量抓取。若现有真实目标没有 DIL 代码块或再生成分支，用合成 fixture 验证其合同，并明确记录该项未取得真实样本；不能伪称实战覆盖。
- 固定独立 fixtures：DIL 正文/来源、FileCite、公式与代码、结构化图表/SVG、普通 Markdown、隐藏工作区、已虚拟化 DIL 前文。脱敏替换应同时保持所有引用 ID 和消息父子关系的一致性。
- 探测报告要记录哪些字段已实测、字段间如何关联，以及样例适用范围。若版本或必需字段与本轮不同，先根据真实证据修订该协议，不能编造 schema 或继续套用不成立的假设。

**Verify**

- `npm test` 验证当前 36 个测试的基线。
- 从主机浏览器对照可见消息 ID 与 API mapping；校验 fallback 每个 cite/filecite/genui 的解析覆盖率以及图表行列与页面一致。
- 用当前 `apiMessageFromNode` 跑合成 DIL fixture，重现“未使用 fallback、Cite 标记泄漏、来源数量为零”；记录结果作为后续 RED 基线。
- 用 `git diff --cached` / `git diff` 检查新文件没有真实会话、账户、Token 或私人样例。

**Done when**

- fixture 集合能复现所有已知故障，来源与组件匹配规则具有样例证据；后续任务不需要猜测 payload 格式。

## Task 2 — 切换会话后入口和选择范围正确

**Blocked by:** Task 1

**Touchpoints:** `src/selectors.ts`；`src/content.ts` 的 `syncRoute`、`composerContainer`、`prefetchConversation`、`enterSelection`、`checkSelectionSurface`；`src/dom-extractor.ts` 的 `visibleBranchHints`；`tests/unit/current-page.test.ts`；`tests/unit/selectors.test.ts`；`tests/e2e/fixture.html`；`tests/e2e/fixture-client.ts`。

**Protocol / Constraints**

- RED 覆盖“隐藏旧工作区在前、可见新工作区在后”，验证当前消息、turn hints 和生成状态不受旧工作区影响；也覆盖 CSS/祖先隐藏与同一输入框 DOM 保留的场景。
- fixture 的“切换对话”应模拟真实保留/隐藏工作区，同时提供普通与项目路由及不同消息集合。加入同会话重建、返回已打开会话、先切 URL 后挂载新工作区的路径。
- 实现统一上下文和入口重挂载。长对话离开视口、后台工作区正在生成、旧会话请求延迟返回都不能改变当前选择。
- 同分支重建只重挂控件；会话/分支切换清理旧选择和预加载归属。当前消息出现后能够重新开始尚未就绪的预加载。

**Verify**

- `npm test -- tests/unit/selectors.test.ts tests/unit/current-page.test.ts tests/unit/conversation-client.test.ts`
- `npm run build:e2e`，另一个终端运行 `npm run fixture`。
- `playwright-cli -s=exporter-dil open --config=.playwright/cli.config.json http://127.0.0.1:4173/c/fixture-conversation`
- 在真实浏览器中切换普通/项目会话、返回、重建，确认输入框右侧始终只有一个可见导出入口；导出文件不含隐藏会话内容。

**Done when**

- 新增失败用例变绿；上述导航流程按钮、消息计数、默认全选和输出内容均归属于当前会话；无旧工作区污染。

## Task 3 — DIL 正文与引用能完整导出

**Blocked by:** Task 1、Task 2

**Touchpoints:** `src/api-message.ts` 的 `apiMessageFromNode`；新增 `src/dil-message.ts`；`src/conversation.ts` 的 `completeConversationFromPayload`、`mergeVisibleMessage`；`src/types.ts`；`src/markdown.ts`；新增 `tests/unit/dil-message.test.ts`；`tests/unit/conversation.test.ts`；`tests/unit/markdown.test.ts`；`tests/e2e/fixture-server.ts`。

**Protocol / Constraints**

- RED 验证 fallback 正文优先于 raw parts；DIL 消息已经挂载时也不被 DOM 正文覆盖；同一消息移出 DOM 后规范正文和引用不变。仅来自 DOM 的思考摘要和引用回复是挂载时补充，不属于这个不变量；普通 Markdown 仍沿用 DOM 增强，不能声明其全文与挂载状态无关。
- RED 验证多来源、重复引用、相同域名不同 URL、同 URL 去重、选择过滤后重编号、缺少来源映射的明确失败，以及 FileCite 无 URL 时保留名称与行号。
- 在同一消息范围内建立引用索引，按原位置替换 token；文件引用独立于网页脚注，保留现有附件表现。
- 类型识别和 DIL 转换集中在适配层；维持普通 Markdown 回答现有行为。原有 DOM 补充摘要、targeted reply、模型信息不得造成 DIL 正文重复或脚注搬到末尾。
- 隐藏/内部节点继续排除；支持 DIL 前文已不在 DOM 的完整分支，不能退化为 DOM-only 导出。

**Verify**

- `npm test -- tests/unit/dil-message.test.ts tests/unit/api-message.test.ts tests/unit/conversation.test.ts tests/unit/markdown.test.ts`
- 重建 `npm run build:e2e` 并重启 fixture server；使用真实扩展勾选含普通与 DIL 回答的 fixture，导出并读取 `.md`。
- 文件含准确选中消息、正文原位置脚注、完整标题和 URL；取消某消息后没有其专属脚注；虚拟化前文仍存在；输出无 Cite/FileCite 标签或私有控制字符。

**Done when**

- 正文和来源合同在 unit、集成与浏览器下载三个层面全部满足，普通路径回归通过。

## Task 4 — DIL 公式、图表与图形转成可读 Markdown

**Blocked by:** Task 3

**Touchpoints:** 新增 `src/dil-message.ts`；`src/api-message.ts`；`src/dom-extractor.ts` 的既有表格/公式转换；新增 `tests/unit/dil-message.test.ts`；`tests/e2e/fixture.html`；`tests/e2e/fixture-server.ts`。

**Protocol / Constraints**

- RED 验证行内/块级 LaTeX、数学转义、fenced/inline code 中原样保留的定界符、表格单元格中的引用、布局展开顺序。
- RED 验证 genui 精确匹配、图表标题/描述/xKey/series/单位/行序、零值、负数、多 series；以及同一回答先后有图表与网页引用时所有标记仍在原位置。
- RED 验证 SVG 中现有可读标签与关联说明的保留；既不泄漏 SVG 实现文本，也不丢失图中已有的文字。没有数据来源时不生成虚构表格。
- 按共享输出合同转换已验证内容；只添加真实样例和当前协议所需的类型，不创建通用 DIL 渲染引擎。
- DIL code、internal markers、原始 charts JSON 不得出现在最终正文；保留用户代码块中的字面量是例外，测试必须区分代码与正文。

**Verify**

- `npm test -- tests/unit/dil-message.test.ts tests/unit/dom-extractor.test.ts tests/unit/markdown.test.ts`
- 在 fixture 浏览器导出公式/图表/布局样例，核对下载内容中的公式源码、表格行列/单位、标签顺序及脚注位置；检查 Markdown 预览里的公式边界与表格可读性。

**Done when**

- 已验证组件的可读语义保留，转换不影响代码内容和引用索引；缺少必要组件数据的场景有可见错误且无下载。

## Task 5 — 自动化回归与五个真实会话下载验收

**Blocked by:** Task 2、Task 3、Task 4

**Touchpoints:** `tests/e2e/fixture-server.ts`；`tests/e2e/fixture-client.ts`；`scripts/build.ts`；`scripts/write-playwright-config.ts`；新增 `tests/e2e/dil-export.js`（Playwright CLI 可执行脚本）；`README.md`；`docs/plans/2026-08-31-chatgpt-markdown-exporter-design.md`。

**Protocol / Constraints**

- 将前述 fixture 用户操作收敛到可复跑的 E2E 脚本；保留现有 API slow/fail/mismatch、virtualized、重建、正在生成等场景。测试从可见控件操作，检查真正的下载文件。
- 实战使用本机目标文件中的 A/B/C/D/E，覆盖普通与带项目名路由、刷新加载、SPA 切换、回到缓存工作区；E 为实施期间用户追加的样例。
- 用户重载构建后，真实页面按下表验收。保持只读会话操作，不为测试发送提示、删除聊天、再生成回答或改变用户分支。已有分支可检查；缺少该样例时用 fixture 验证并注明实战未覆盖。
- 429、登录过期等环境失败记录状态、阶段和用户可见结果；不得用延长等待、连续请求或 mock 数据冒充实战成功。
- 更新已有设计文档中受本次方案影响的数据源、DOM 作用域和内容合同；README 只写用户实际需要知道的支持范围。文档不包含私人目标与样例。

**Verify**

```bash
npm test
npm run typecheck
npm run build
npm run build:e2e
# 另一个终端启动；重建后重启以读取最新 bundle
npm run fixture
playwright-cli -s=exporter-dil open --config=.playwright/cli.config.json http://127.0.0.1:4173/c/fixture-conversation
playwright-cli -s=exporter-dil run-code --filename=tests/e2e/dil-export.js
```

上述 E2E 脚本在本 Task 新增后才能运行。实战执行通过本机浏览器连接或 Chrome 原生操作完成；连接不可用时如实记录，不能以 fixture 成功替代。

| 实战动作 | 必须观察到的结果 |
| --- | --- |
| 打开和切换 A/B/C/D/E | 导出按钮在当前输入框右侧，旧工作区不保留可见入口 |
| 全选、全不选、逐条取消、取消 | 勾选与数量一致；取消恢复普通页面 |
| A 新渲染器回答导出 | 正文完整；来源在对应位置；公式 LaTeX 完整；图表数据与页面相符；图形文字保留 |
| B 普通 Markdown 导出 | 正文、普通引用、原有表格不回归 |
| C 多轮会话在底部导出 | 早期消息仍在文件中；取消一条消息只移除该消息及其专属脚注 |
| D 项目会话导出 | 路由、附件名称/链接、当前分支正确 |
| 同一 DIL 消息滚动前后导出 | 在选择相同消息时 Markdown 正文与脚注一致，不因挂载状态变化 |
| 生成中、读取失败、转换失败 | 显示对应错误，不产生已知不完整的下载 |
| 检查下载文件 | 有 `.md` 和分钟级时间；无水印、账户数据、旧会话文字或未解析的正文控制标记 |

**Done when**

- Unit/typecheck/build、可复跑 fixture E2E 全部通过；五个真实会话的实际下载已逐项检查，结果及未覆盖项记录在本地 `test-results/`。
- 若尚未获用户重载或实战被环境阻断，交付可重载的 `dist` 和具体待验收项，保持实战状态未完成；不伪造通过结论。
- 最后 `git diff --check` 通过，对改动文档运行 `rumdl check`；检查待提交文件没有真实 HTML、会话 ID、账号、Token 或私人下载内容。

## 依赖与完成边界

执行顺序为 Task 1 → Task 2 → Task 3 → Task 4 → Task 5。每个结果完成后核对其 Verify 和 Done when，不因测试代码已经存在就跳过真实浏览器操作。

用户已授权在开发分支实施。交付物是 TypeScript 源码、回归测试、可重载 `dist` 和验证记录；用户本人重载安装的扩展，本轮不推送远程仓库。

## 执行记录

- RED：工作区与 DIL 初始契约测试 6 项失败，暴露隐藏会话混入、raw parts 优先和来源缺失；补充公式/代码保护测试 2 项失败，再逐项转绿。
- 定向 probe 确认 formattedData 为与 data 同序的数组，已经包含单位；补充 RED 后实现按单元格优先使用显示值。
- 真实回答转换 probe 暴露 SVG figure 被包装成代码块；补充 RED 后按 raw parts 中的图形标签识别。新增可见摘要/模型补充测试也先 RED 后 GREEN。
- `npm test`、`npm run typecheck`、`npm run build`、`npm run build:e2e` 已通过。fixture Playwright CLI 脚本报告 `status: passed`，实际核对 6 个下载文件；涵盖隐藏工作区、返回、延迟挂载、重建、虚拟化、慢请求切换、生成中、API 失败/不匹配、转换失败不下载。
- 真实 A 的单条回答本地转换核验：26 个来源、8 行图表数据；保留 SVG 文字；无未解析控制标记、SVG 或 DIL 实现标签。此项是实际 payload 转换检查，不是重载后的 UI/下载实战验收。
- 未取得真实 DIL 代码块或再生成分支样例；代码区域保护由合成 fixture 验证，分支重建由既有 unit 覆盖。四个真实会话的最终下载验收仍待用户重载。
- 用户在实施过程中新增实战样例 E，最终验收扩展为五个会话。首次实战在 C/E 暴露 entity 与 url 标记，均先新增 RED 用例再修复，并加入 fixture E2E。C/E 实际 payload 全消息转换无残余标记，已生成第二次重载构建。
- C 第二次重载实战确认完整分支为 16/16；下载暴露 null 来源标题，补充 RED 后归一化并使用域名。C/E 实际完整分支经最终 renderer 成功生成 45/24 个脚注。
- 当前 `npm test` 为 11 个测试文件、53 个测试全部通过；最新 fixture E2E 核对 7 个实际下载，包含 null 标题和等待旧请求返回后再次导出。

### 第二次重载前的实战结果

| 样例 | 已观察的结果 |
| --- | --- |
| A | 当前工作区入口正常；全选 3 条消息下载成功，26 条来源脚注、8 行图表及公式/SVG 标签完整，无残余标记 |
| B | 全选/全不选计数正确，空选择禁用；全选 5 条消息下载成功，35 条来源脚注 |
| C | SPA 切换后入口正常；首次下载被 entity 标记明确阻断；已修复，实际 payload 16 条消息转换无残余标记，待 UI 复验 |
| D | 项目侧栏切换后入口正常；全选 5 条消息下载成功，49 条来源脚注 |
| E | 追加样例入口正常；首次下载被 url 标记明确阻断；已修复，实际 payload 9 条消息转换无残余标记，待 UI 复验 |

上述三个实际下载无账户信息，均含分钟级文件名与 `.md`。真人会话的逐条取消、
滚动前后同内容比较及最终返回缓存工作区仍需在第二次重载后完成；不能把自动化
fixture 的同类通过结果当作已经完成这些真人页面动作。

### 最终实战验收（用户 14:43 确认重载）

| 样例 | 最终下载核验 |
| --- | --- |
| A | 3 条消息、26 条脚注，公式、8 行图表与 SVG 标签保留；底部和滚动回前文两次下载逐字一致 |
| B | 5 条消息、35 条脚注；取消后可重新进入选择；经过 D 后返回缓存工作区，下载与之前逐字一致 |
| C | 16 条消息、45 条脚注；取消第 16 条后为 15 条、36 条脚注，之前 15 条正文不变；无标题来源使用域名 |
| D | 5 条消息、49 条脚注；与之前下载逐字一致；额外验证用户提供的完整项目名路由可进入 5/5 选择并取消 |
| E | 9 条消息、24 条脚注；15 个 url 标记均保留为原位置的有标题链接 |

实际文件均有分钟级文件名与 `.md`，无残余控制标记或账户信息。
生成中/API 失败/转换失败/分支不匹配、DOM 重建、延迟挂载、隐藏工作区及旧请求
晚返回的拒绝或恢复行为由真实扩展 fixture E2E 覆盖，不伪称真人页面制造了这些故障。
真实 DIL 代码示例和再生成分支未人为创建，分别由合成 fixture 与既有 unit 覆盖。

按用户追加要求，五页均在可导出、回答完成的状态采集；readyState 为 complete，
等待字体加载与两帧渲染后保存未经改写的 document.body.innerHTML。同一会话 API
均返回 200。HTML/API 和评审材料只放本机桌面评审目录及 Git 忽略目录，不进 Git。
