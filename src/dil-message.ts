import { createCitationToken } from "./markdown";
import type { CitationSource } from "./types";

interface DilSource {
  ref_id: string;
  title: string | null;
  url: string;
}
interface DilComponent {
  status: string;
  componentName: string;
  state: {
    items?: DilSource[];
    refid?: string;
    file_name?: string;
    safe_file_url?: string | null;
  };
}
interface DilMetadata {
  fallbackMarkdownVersion: number;
  fallbackMarkdown: string;
  appData?: { opGenui?: { componentResults?: Record<string, DilComponent> } };
}
interface ChartData {
  meta: { title?: string; description?: string };
  xKey: string;
  series: Array<{ dataKey: string; label: string; valueSuffix?: string }>;
  data: Array<Record<string, unknown>>;
  formattedData?: Array<Record<string, string>>;
}
interface WidgetReference {
  matched_text: string;
  data: { widget_type: string; content: ChartData };
}

// Markdown examples must stay literal, including control markers and TeX.
// Separate fenced and inline code before applying any format-specific rewrite.
function transformProse(
  input: string,
  transform: (text: string) => string,
  transformFence?: (language: string, body: string) => string | undefined,
): string {
  const inline = (text: string): string => {
    const delimiters = /`+/gu;
    let offset = 0;
    let result = "";
    let opening: RegExpExecArray | null;
    while ((opening = delimiters.exec(text))) {
      const backslashes =
        text.slice(0, opening.index).match(/\\+$/u)?.[0].length ?? 0;
      if (backslashes % 2 !== 0) continue;
      // Code spans can contain newlines, but cannot cross a blank paragraph.
      const rest = text.slice(delimiters.lastIndex);
      const paragraphEnd = rest.search(/\n[ \t]*\n/u);
      const paragraph = paragraphEnd < 0 ? rest : rest.slice(0, paragraphEnd);
      const width = opening[0].length;
      const closing = [...paragraph.matchAll(/`+/gu)].find(
        (run) => run[0].length === width,
      );
      if (!closing) continue;
      const after = delimiters.lastIndex + closing.index + closing[0].length;
      result +=
        transform(text.slice(offset, opening.index)) +
        text.slice(opening.index, after);
      offset = after;
      delimiters.lastIndex = after;
    }
    return result + transform(text.slice(offset));
  };
  const opening = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gmu;
  let offset = 0;
  let result = "";
  let match: RegExpExecArray | null;
  while ((match = opening.exec(input))) {
    const fence = match[1]!;
    const closing = new RegExp(
      `^ {0,3}${fence[0]}{${fence.length},}[ \\t]*(?:\\n|$)`,
      "gm",
    );
    closing.lastIndex = opening.lastIndex;
    const end = closing.exec(input);
    const after = end ? closing.lastIndex : input.length;
    const replacement =
      end &&
      transformFence?.(
        match[0].slice(match[0].indexOf(fence) + fence.length).trim(),
        input.slice(opening.lastIndex, end.index).trim(),
      );
    result +=
      inline(input.slice(offset, match.index)) +
      (typeof replacement === "string"
        ? `${replacement}\n`
        : input.slice(match.index, after));
    offset = after;
    opening.lastIndex = after;
  }
  return result + inline(input.slice(offset));
}

function chartMarkdown(chart: ChartData): string {
  if (!chart?.xKey || !chart.series?.length || !chart.data?.length)
    throw new DilConversionError("缺少图表数据");
  const cell = (value: unknown): string =>
    String(value ?? "")
      .replaceAll("|", "\\|")
      .replace(/\r?\n/gu, "<br>");
  const row = (values: unknown[]): string =>
    `| ${values.map(cell).join(" | ")} |`;
  return [
    chart.meta?.title ?? "",
    chart.meta?.description ?? "",
    [
      row([chart.xKey, ...chart.series.map((series) => series.label)]),
      row(["---", ...chart.series.map(() => "---")]),
      ...chart.data.map((item, index) =>
        row([
          chart.formattedData?.[index]?.[chart.xKey] ?? item[chart.xKey],
          ...chart.series.map((series) => {
            const formatted = chart.formattedData?.[index]?.[series.dataKey];
            if (formatted !== undefined) return formatted;
            const value = item[series.dataKey];
            return value === undefined || value === null
              ? ""
              : `${value}${series.valueSuffix ?? ""}`;
          }),
        ]),
      ),
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function svgText(svg: string): string {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror"))
    throw new DilConversionError("图形文本无法解析");
  return svgLabels(parsed);
}

function svgLabels(parsed: Document): string {
  return [...parsed.querySelectorAll("title, desc, text")]
    .map((element) => element.textContent?.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export class DilConversionError extends Error {
  constructor(reason: string) {
    super(`无法完整导出此回答：${reason}`);
    this.name = "DilConversionError";
  }
}

export function dilMarkdown(
  metadata: Record<string, unknown>,
  rawParts: string,
): {
  markdown: string;
  citations: CitationSource[];
} {
  const dil = metadata.model_dil_v2 as DilMetadata;
  if (dil.fallbackMarkdownVersion !== 1 || !dil.fallbackMarkdown?.trim())
    throw new DilConversionError("缺少受支持的 Markdown 正文");
  // DIL serializes actual SVG figures as ```svg fences. Raw parts distinguish
  // figures from literal code; text labels survive JSX-to-SVG serialization.
  const renderedFigures = new Set<string>();
  transformProse(rawParts, (prose) => {
    for (const match of prose.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu)) {
      // Raw parts are JSX, so expression attributes are not valid XML. Only
      // read literal labels here; the serialized fallback remains strict SVG.
      const text = svgLabels(
        new DOMParser().parseFromString(match[0], "text/html"),
      );
      if (text) renderedFigures.add(text);
    }
    return prose;
  });
  const components = Object.values(
    dil.appData?.opGenui?.componentResults ?? {},
  ).filter((component) => component.status === "resolved");
  const sources = new Map(
    components
      .filter((c) => c.componentName === "Cite")
      .flatMap((c) => c.state.items ?? [])
      .map((source) => [source.ref_id, source]),
  );
  const files = new Map(
    components
      .filter((c) => c.componentName === "FileCite")
      .map((c) => [c.state.refid, c.state]),
  );
  const citations: CitationSource[] = [];
  const sourceIndices = new Map<string, number>();
  const widgets = new Map(
    ((metadata.content_references ?? []) as WidgetReference[]).map(
      (reference) => [reference.matched_text, reference],
    ),
  );
  const markdown = transformProse(
    dil.fallbackMarkdown,
    (prose) =>
      prose
        .replace(/\uE200([^\uE201]*)\uE201/gu, (marker, fields: string) => {
          const [kind, ...refs] = fields.split("\uE202");
          if (kind === "cite")
            return refs
              .map((ref) => {
                const source = sources.get(ref);
                if (!source?.url)
                  throw new DilConversionError("引用来源未就绪");
                let index = sourceIndices.get(source.url);
                if (index === undefined) {
                  index =
                    citations.push({
                      title: source.title ?? "",
                      url: source.url,
                    }) - 1;
                  sourceIndices.set(source.url, index);
                }
                return createCitationToken(index);
              })
              .join(" ");
          if (kind === "filecite") {
            const file = files.get(refs[0]);
            if (!file?.file_name)
              throw new DilConversionError("附件引用未就绪");
            const label = file.safe_file_url
              ? `[${file.file_name}](${file.safe_file_url})`
              : `[附件：${file.file_name}]`;
            return `${label}${refs[1] ? `（${refs[1]}）` : ""}`;
          }
          if (kind === "genui") {
            const reference = widgets.get(marker);
            if (reference?.data?.widget_type !== "charts_widget_v2")
              throw new DilConversionError("缺少图表数据");
            return chartMarkdown(reference.data.content);
          }
          if (kind === "entity") {
            const entity = JSON.parse(refs[0]!) as [string, string];
            return entity[1];
          }
          if (kind === "url") return `[${refs[0]}](${refs[1]})`;
          throw new DilConversionError("组件内容尚未支持");
        })
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu, svgText)
        .replace(
          /\\\[([\s\S]*?)\\\]/gu,
          (_match, tex: string) => `$$\n${tex.trim()}\n$$`,
        )
        .replace(
          /\\\(([\s\S]*?)\\\)/gu,
          (_match, tex: string) => `$${tex.trim()}$`,
        ),
    (language, body) => {
      if (language !== "svg" || !/^<svg\b[^>]*>[\s\S]*<\/svg>$/iu.test(body))
        return undefined;
      const text = svgText(body);
      return renderedFigures.has(text) ? text : undefined;
    },
  );
  return { markdown, citations };
}
