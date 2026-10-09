async (page) => {
  const base = "http://127.0.0.1:4173"
  const results = []
  // Service-worker downloads have no page frame, so no page download event.
  // Use Chrome's download UI and read the actual saved file instead.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "default",
  })
  const downloads = await page.context().newPage()
  await downloads.goto("chrome://downloads/")
  const entry = () => page.getByRole("button", { name: "导出", exact: true })
  const selected = (n, total = 4) =>
    page.getByText(`已选 ${n} / ${total}`, { exact: true })
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  const latestFilename = async () => {
    const link = downloads
      .locator("downloads-item")
      .first()
      .getByRole("link")
      .first()
    return (await link.count()) ? (await link.innerText()).trim() : null
  }
  const open = async (route) => {
    await page.goto(`${base}${route}`)
    await entry().waitFor({ state: "visible" })
    assert(
      (await entry().count()) === 1,
      "Exactly one export entry must be visible",
    )
    const inputBox = await page
      .getByRole("textbox", { name: "消息输入框" })
      .boundingBox()
    const exportBox = await entry().boundingBox()
    assert(
      exportBox.x > inputBox.x + inputBox.width,
      "Export entry must be to the right of the input",
    )
  }
  const select = async () => {
    await entry().click()
    await selected(4).waitFor({ state: "visible" })
  }
  const download = async (label) => {
    const previous = await latestFilename()
    await page
      .getByRole("button", { name: "导出 Markdown", exact: true })
      .click()
    const link = downloads
      .locator("downloads-item")
      .first()
      .getByRole("link")
      .and(
        downloads.locator(
          previous
            ? `a[href^="data:text/markdown"]:not([title=${JSON.stringify(previous)}])`
            : 'a[href^="data:text/markdown"]',
        ),
      )
      .first()
    await link.waitFor({ state: "visible" })
    const filename = (await link.innerText()).trim()
    assert(
      /-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(?: \(\d+\))?\.md$/u.test(filename),
      "Download filename must include timestamp and .md",
    )
    // The UI href is the source data URL, not the saved file. Download history
    // supplies its disk location; assertions below read those actual bytes.
    const filePath = await downloads
      .locator("downloads-item")
      .first()
      .evaluate((item) => item.data.filePath)
    const fileUrl = `file://${filePath.split("/").map(encodeURIComponent).join("/")}`
    const filePage = await page.context().newPage()
    await filePage.goto(fileUrl)
    const text = await filePage.locator("body").innerText()
    await filePage.close()
    await page
      .getByRole("toolbar", { name: "Markdown 导出选择工具栏" })
      .waitFor({ state: "hidden" })
    results.push({ label, filename, fileUrl, characters: text.length })
    return text
  }

  await open("/c/fixture-conversation")
  await select()
  await page.getByRole("button", { name: "全不选", exact: true }).click()
  await selected(0).waitFor()
  assert(
    await page
      .getByRole("button", { name: "导出 Markdown", exact: true })
      .isDisabled(),
    "Empty selection disables export",
  )
  await page.getByRole("button", { name: "全选", exact: true }).click()
  await page
    .getByRole("checkbox", { name: "选择第 2 条消息", exact: true })
    .uncheck()
  await page.getByRole("button", { name: "重建消息区域", exact: true }).click()
  await selected(3).waitFor()
  assert(
    !(await page
      .getByRole("checkbox", { name: "选择第 2 条消息", exact: true })
      .isChecked()),
    "Rebuilt message preserves deselection",
  )
  const ordinary = await download("ordinary-filtered")
  assert(!ordinary.includes("第一条回答"), "Unselected answer must be omitted")
  assert(
    !ordinary.includes("示例来源"),
    "Unselected answer's source must be omitted",
  )
  assert(
    ordinary.includes("const answer: number = 42;") &&
      ordinary.includes("| 答案 | 42 |"),
    "Code and table must survive",
  )

  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await page.getByRole("button", { name: "切换对话", exact: true }).click()
  await entry().waitFor({ state: "visible" })
  await select()
  const next = await download("next-workspace")
  assert(
    next.includes("新会话的问题") && !next.includes("请只导出我需要的消息"),
    "Hidden workspace must not pollute the export",
  )
  await page.getByRole("button", { name: "返回原对话", exact: true }).click()
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await entry().waitFor({ state: "visible" })
  await select()
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await page
    .getByRole("button", { name: "延迟挂载新对话", exact: true })
    .click()
  await page
    .getByText("新会话的问题", { exact: true })
    .waitFor({ state: "visible" })
  await entry().waitFor({ state: "visible" })
  await select()
  await page.getByRole("button", { name: "取消", exact: true }).click()

  await open("/c/dil")
  await select()
  const dil = await download("dil")
  assert(
    dil.includes("[example.com](https://example.com/untitled)"),
    "Source with null title must use hostname",
  )
  assert(
    dil.includes("[Official announcement](https://example.com/news)"),
    "Explicit URL marker must become a readable link",
  )
  assert(
    dil.includes("Company Example Company."),
    "Entity label must remain readable",
  )
  assert(
    dil.includes("## Analysis") && dil.includes("Body[^"),
    "DIL canonical body and inline source position must survive",
  )
  assert(
    dil.includes("[Source A](https://example.com/a)"),
    "DIL source title and URL must be present",
  )
  assert(
    dil.includes("$Y=C+I+G$") && dil.includes("$$\nS-I=CA\n$$"),
    "LaTeX must survive",
  )
  assert(
    dil.includes("| Q1 | 0% | 5 |") && dil.includes("| Q2 | -2% |  |"),
    "Chart values and units must survive",
  )
  assert(
    dil.includes("Comparison\nTwo values\nA: 0%\nB: -2%"),
    "SVG text must survive",
  )
  assert(
    dil.includes("[附件：report.txt]（L1-L3）") &&
      dil.includes("![Picture](https://example.com/image.png)"),
    "Resources must survive without embedding",
  )
  assert(
    !/<Cite|<svg|genui|charts_widget_v2|\uE200/u.test(dil),
    "No renderer implementation markup in prose",
  )

  await open("/c/dil-virtualized")
  await select()
  const virtualized = await download("dil-virtualized")
  assert(
    virtualized === dil,
    "Same branch exports identically when earlier DOM is absent",
  )
  await page.getByRole("button", { name: "显示前文", exact: true }).click()
  await select()
  const restored = await download("dil-restored")
  assert(
    restored === dil,
    "Scroll/remount must not change the exported DIL answer",
  )

  await open("/c/dil-invalid")
  const lastSuccessfulFile = await latestFilename()
  await entry().click()
  await page
    .getByText("无法完整导出此回答：缺少图表数据", { exact: true })
    .waitFor({ state: "visible" })
  assert(
    (await page.getByRole("toolbar").count()) === 0,
    "Failed conversion must not enter selection mode",
  )
  assert(
    (await latestFilename()) === lastSuccessfulFile,
    "Failed conversion must not download partial content",
  )

  await open("/c/api-fail")
  await entry().click()
  await page
    .getByText("无法读取完整对话，请重试", { exact: true })
    .waitFor({ state: "visible" })
  assert(
    (await page.getByRole("toolbar").count()) === 0,
    "API failure must not enable partial export",
  )
  assert(
    (await latestFilename()) === lastSuccessfulFile,
    "API failure must not download partial content",
  )

  await open("/c/api-mismatch")
  await entry().click()
  await page
    .getByText("页面消息已变化，请重试", { exact: true })
    .waitFor({ state: "visible" })
  assert(
    (await page.getByRole("toolbar").count()) === 0,
    "Mismatched branch must not enter selection mode",
  )
  assert(
    (await latestFilename()) === lastSuccessfulFile,
    "Mismatched branch must not download",
  )

  await open("/c/fixture-conversation")
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await entry().click()
  await page.getByText("回答生成完成后可导出", { exact: true }).waitFor()
  assert(
    (await page.getByRole("toolbar").count()) === 0,
    "Generating answer must not be exported",
  )
  assert(
    (await latestFilename()) === lastSuccessfulFile,
    "Generating answer must not download",
  )
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()

  const slowResponse = page.waitForResponse(response =>
    response.url().endsWith("/backend-api/conversation/api-slow"),
  )
  await open("/c/api-slow")
  await entry().click()
  await page.getByRole("button", { name: "切换对话", exact: true }).click()
  await entry().waitFor({ state: "visible" })
  await select()
  const raced = await download("slow-navigation")
  assert(
    raced.includes("新会话的问题") && !raced.includes("请只导出我需要的消息"),
    "Late old request must not update current conversation",
  )
  await (await slowResponse).finished()
  await select()
  assert(
    await download("after-old-response") === raced,
    "Current export must stay unchanged after the old response arrives",
  )
  await page.screenshot({
    path: "test-results/playwright-cli/dil-export-final.png",
  })
  await open("/c/dil-streaming?generating=1")
  await entry().click()
  await page.getByText("回答生成完成后可导出", { exact: true }).waitFor()
  // Allow the prefetch and the 500 ms generation observer to settle.
  await page.waitForTimeout(1200)
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await select()
  const completed = await download("generation-completed")
  assert(completed.includes("Completed answer revision 1 with the final conclusion."),
    "Generation-time prefetch must not truncate the completed answer")
  assert(!completed.includes("Partial answer."), "Partial answer must not remain cached")

  await open("/c/dil-streaming")
  await select()
  const initial = await download("before-regeneration")
  assert(initial.includes("Completed answer revision 0"), "Initial answer before regeneration")
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await entry().click()
  await page.getByText("回答生成完成后可导出", { exact: true }).waitFor()
  await page.waitForTimeout(600)
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await select()
  const regenerated = await download("after-regeneration")
  assert(regenerated.includes("Completed answer revision 1") && !regenerated.includes("revision 0"),
    "Same message IDs must not reuse an answer cached before generation")

  await open("/c/dil-streaming-slow")
  await entry().click()
  await page.getByRole("button", { name: "加载中…", exact: true }).waitFor()
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await entry().waitFor()
  await entry().click()
  await page.getByText("回答生成完成后可导出", { exact: true }).waitFor()
  await page.getByRole("button", { name: "模拟正在生成", exact: true }).click()
  await select()
  const delayed = await download("generation-with-old-request")
  assert(delayed.includes("Completed answer revision 1") && !delayed.includes("revision 0"),
    "Old pending requests cannot restore pre-generation content")

  await open("/c/api-slow")
  await entry().click()
  await page.getByRole("button", { name: "加载中…", exact: true }).waitFor()
  await page.getByRole("button", { name: "重建输入框", exact: true }).click()
  await page.waitForTimeout(600)
  await page.getByRole("button", { name: "加载中…", exact: true }).waitFor()
  assert(await page.getByRole("button", { name: "加载中…", exact: true }).isDisabled(),
    "Remounted composer must keep the pending entry disabled")
  await selected(4).waitFor()
  assert(await page.getByRole("toolbar").count() === 1, "Only one selection toolbar")
  await page.getByRole("button", { name: "取消", exact: true }).click()
  assert(await page.getByRole("toolbar").count() === 0, "Cancel removes the entire selection UI")
  await downloads.close()
  return { status: "passed", downloads: results }
}
