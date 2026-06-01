export const INTERACTIVE_CONTENT_AUTHORING_PROSE_V2 = `\
### Rendering Context

Frames render inside a resizable iframe in the conversation side panel. The default panel is often about 40% of the browser width, and inline frames are capped at 600px high before the user expands them. Make the top 600px useful: clear title, primary visual or metric, and the first meaningful controls or status.

Before declaring a frame done, mentally check both the default panel width and fullscreen. Look for clipped content, collapsed charts, colorless bulk surfaces, stale template data, and whether the top 600px is useful.

### React Component Rules

- Export a single default React component.
- Wrap all JSX in a proper React function component. Do not generate standalone JSX outside a component.
- The component must not require props.
- Import React hooks from \`react\` when using them.
- Hooks, including \`useState\`, \`useEffect\`, and \`useFile\`, must be called at the top level of the component.
- \`React.createElement\` is not supported.
- There is no internet access in the frame environment.
- External links must include \`target="_blank"\` because frames render inside an iframe.
- When displaying text with < or > symbols in JSX, use HTML entities such as \`&lt;\` and \`&gt;\`, or wrap the string in braces.

### Layout Rules

- Default to one centered, naturally scrolling frame: \`min-h-screen\`, \`mx-auto\`, \`max-w-3xl\` or \`max-w-5xl\`, \`px-4\`, and clear vertical spacing.
- Do not gate column count with viewport breakpoints such as \`md:grid-cols-2\`, \`lg:grid-cols-3\`, or \`lg:grid-cols-12\`. The iframe width is not the browser viewport.
- For responsive columns, use width-independent CSS grid with \`auto-fit\` and \`minmax(...)\` through the \`style\` prop.
- If you use \`h-screen\`, \`height: "100vh"\`, or \`h-full\` with \`overflow-hidden\`, the main content region must have \`overflow-y-auto\`.
- Do not crop tall screenshots, mockups, or embedded frame images with \`object-cover\`. Use \`object-contain\`.
- Keep display type modest in constrained regions. Use \`text-4xl\` or larger only in full-width hero areas, not inside narrow cards or columns.
- Avoid horizontal scrolling. If content does not fit at the default panel width, simplify or stack it.

BAD:
\`\`\`tsx
<div className="h-screen overflow-hidden">
  <main className="grid lg:grid-cols-3 gap-6">{cards}</main>
</div>
\`\`\`

GOOD:
\`\`\`tsx
<div className="min-h-screen bg-background">
  <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">{content}</main>
</div>
\`\`\`

### Color And Visual Identity

- Tailwind classes are precompiled. Any arbitrary value in a className, such as \`h-[600px]\`, \`text-[14px]\`, \`bg-[#ff0000]\`, or \`grid-cols-[200px_1fr]\`, fails validation. Use predefined utilities such as \`h-96\`, \`text-sm\`, and \`bg-red-500\`, or use the \`style\` prop for exact values.
- Use \`bg-background\` and \`bg-card\` for surfaces instead of hardcoded \`bg-white\`.
- Every frame needs at least one explicit accent color from literal Tailwind chroma classes such as \`indigo-*\`, \`emerald-*\`, \`violet-*\`, or \`sky-*\`, or from a small hex palette constant.
- Apply the accent deliberately on headings, primary actions, important metrics, and selected state. Do not leave color only in tiny status pills.
- \`bg-primary\`, \`text-primary\`, and the default shadcn button style are near-black in this environment. They are not a brand color.
- \`bg-background\`, \`bg-card\`, \`bg-secondary\`, \`text-foreground\`, and \`text-muted-foreground\` are structural neutrals. They are not a palette by themselves.
- Keep the palette small: one accent family plus neutrals is usually enough. Leaving the frame colorless is wrong.
- Use lucide-react icons instead of emojis.
- Use shadcn/ui components for a polished baseline. Use Cards for individual charts, data visualizations, and key metrics or KPIs. Do not wrap controls, inputs, navigation, or simple text content in Cards. Avoid nested Cards.
- For shadcn Buttons, use semantic variants such as \`variant="default"\`, \`variant="secondary"\`, \`variant="outline"\`, and \`variant="destructive"\`. Let shadcn handle hover states unless an active or selected state needs a visible accent.

### Chart Rules

- Use shadcn chart components for charts: \`ChartContainer\`, \`ChartConfig\`, \`ChartTooltip\`, and \`ChartTooltipContent\`.
- \`ChartContainer\` and \`ResponsiveContainer\` need explicit sizing. Use \`className="h-72 w-full"\`, another predefined height plus \`w-full\`, or \`width="100%"\` with a numeric height.
- Do not rely on a chart wrapper's default width.
- Use \`chartConfig\` with chart color variables for series colors, for example \`{ revenue: { label: "Revenue", color: "var(--chart-1)" } }\`.
- Reference chart config colors from chart elements with \`var(--color-revenue)\`. Direct \`var(--chart-1)\` through \`var(--chart-5)\` is also acceptable for simple examples.
- Chart series fills and strokes use shadcn chart variables. Brand identity still needs a literal Tailwind chroma accent or hex palette elsewhere in the frame.
- Use \`<Cell>\` for per-bar or per-slice colors. Do not insert raw \`<rect>\` elements for data colors.
- Keep margins large enough for axes, labels, and legends at narrow iframe widths, for example \`margin={{ top: 20, right: 30, left: 20, bottom: 20 }}\`.
- Tooltip \`formatter\` must be a function returning \`[value, name]\`; \`labelFormatter\` must be a function returning a string.
- Legends should follow the natural flow of the layout. Avoid \`position: absolute\` for legends.

### Data And File Handling

- Decide where the data lives based on what the brief gives you.
- If a structured file is available because the user attached one or the brief references one, use \`useFile\` and read directly from it. Do not recopy the file contents into the component source; that wastes tokens and can silently drift from the source of truth.
- If the data is small and already embedded in the brief, such as a handful of items, a roadmap of ten entries, or a few KPIs, inline it as a literal in the component.
- If both a file and inline snippets exist, prefer the actual file.
- Do not synthesize a fake file from inline data, and do not paraphrase inline data into \`useFile\` loading code.
- If a declared data array such as \`ITEMS\`, \`STORIES\`, or \`ROWS\` exists, rendered JSX must consume it. Do not declare correct data and render stale hardcoded content.
- Never fabricate missing names, numbers, URLs, booleans, totals, or logos. If the brief does not provide a value, omit it or show \`No data available\`.
- Every async source, including \`useFile\` or \`fetch\`, must expose loading, ok, empty, and error states.
- Never block the whole render on \`if (!data) return <p>Loading...</p>\`. Keep the frame shell visible and show state-specific content in the data region.
- Parse file content inside \`useEffect\` with visible fallback UI. Catch JSON, CSV, and file-read errors.
- Always use \`papaparse\` for CSV files with \`skipEmptyLines: "greedy"\`.

### useFile Reference

- Import \`useFile\` from \`@dust/react-hooks\`.
- \`useFile()\` accepts either a file ID, such as \`fil_abc123\` from an attachment tag, or a scoped file path.
- Supported scoped paths are explicit and portable: \`conversation-{conversationId}/report.csv\` for a conversation file, and \`pod-{podId}/filename.md\` for a pod file.
- Never use bare \`conversation/filename\` or \`pod/filename\` paths. They are context-dependent, non-portable, and can silently load the wrong file.
- Store file IDs as intact strings such as \`"fil_abc123"\`, not as string concatenation.
- \`file.text()\` is async. Await it inside \`useEffect\`; never call it directly in render logic.
- For images, always load with \`useFile\`, create a local object URL with \`URL.createObjectURL(file)\`, and render that URL in \`<img>\` or background styles. Do not fetch remote images.
- Custom components that render files should use \`fileId\` as the prop name so server-side prefetching can work.
- Other frames can be imported as React components by file ID or explicit scoped path, for example \`import MyComponent from "fil_abc123"\` or \`import MyComponent from "conversation-conv_123/MyFrame.tsx"\`. Transitive imports are supported.
- To let users download data, import \`triggerUserFileDownload\` from \`@dust/react-hooks\` and expose it through a button or other user action. Never auto-trigger downloads.
- To capture the current visualization, import \`captureScreenshot\` from \`@dust/react-hooks\` and call \`await captureScreenshot("my-chart.png")\` or \`await captureScreenshot()\` from a user-triggered action.

### Interaction Rules

- If an element looks clickable, it must do something visible: change selected state, expand content, copy with feedback, download, open a real link, or update the view.
- Do not use \`onClick={() => console.log(...)}\` or inert buttons.
- Active tabs, selected chips, expanded cards, and toggles need a visible selected style.
- Do not register global arrow-key navigation with \`window.addEventListener("keydown", ...)\`. It hijacks the host page. If keyboard navigation is necessary, scope \`onKeyDown\` to a focused element with \`tabIndex={0}\`.
- Nullable numeric or sentinel state must use explicit checks such as \`state !== null && state !== undefined\`. Do not use \`if (state)\` when \`0\` is valid.

### Brief Fidelity Rules

- Preserve named items, exact counts, titles, labels, dates, priorities, and quoted strings from the brief.
- Honor explicit \`remove\`, \`keep\`, \`group\`, \`split\`, and \`do not split\` instructions verbatim.
- Do not rename or paraphrase required item names unless the user asks for rewriting.
- Do not add provenance disclaimers, audits of the user's facts, or meta-commentary. Render the requested content.
- If adapting a template, replace old-period literals everywhere. New declared data must drive the JSX.

### Output And Imports

- Default output is a single Frame React component with a default export.
- Use \`@dust/slideshow/v2\` only when the user explicitly asks for slides, a presentation, a deck, or multi-slide content.
- Imports are limited to \`react\`, \`recharts\`, \`lucide-react\`, \`papaparse\`, \`shadcn\`, \`@viz/lib/utils\`, \`@dust/react-hooks\`, \`@dust/slideshow/v2\`, legacy \`@dust/slideshow/v1\` imports only when editing an existing v1 slideshow, and frame file references.
- No other third-party libraries are installed or available.
`;

export const INTERACTIVE_CONTENT_USE_FILE_EXAMPLES_V2 = `\
Example using small inline data from the brief:

\`\`\`tsx
const ROADMAP_ITEMS = [
  { title: "Billing migration", owner: "Growth", status: "On track" },
  { title: "SOC2 evidence", owner: "Security", status: "Blocked" },
  { title: "Q3 launch prep", owner: "Product", status: "At risk" },
];

export default function RoadmapFrame() {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold text-indigo-700">Roadmap</h1>
        <div className="grid gap-3">
          {ROADMAP_ITEMS.map((item) => (
            <article key={item.title} className="rounded-lg border bg-card p-4">
              <h2 className="font-medium text-foreground">{item.title}</h2>
              <p className="text-sm text-muted-foreground">
                {item.owner} - {item.status}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
\`\`\`

Example using \`useFile\` when a structured file is available:

\`\`\`tsx
import { useEffect, useState } from "react";
import Papa from "papaparse";
import { AlertCircle } from "lucide-react";
import { useFile } from "@dust/react-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "shadcn";

type Row = {
  name: string;
  value: string;
};

type FileState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ok"; rows: Row[] };

export default function DataFrame() {
  const file = useFile("fil_abc123");
  const [fileState, setFileState] = useState<FileState>({ status: "loading" });

  useEffect(() => {
    if (!file) {
      setFileState({ status: "loading" });
      return;
    }

    let cancelled = false;

    async function loadFile() {
      try {
        const text = await file.text();
        const parsed = Papa.parse<Row>(text, {
          header: true,
          skipEmptyLines: "greedy",
        });

        if (cancelled) {
          return;
        }

        if (parsed.errors.length > 0) {
          setFileState({ status: "error", message: parsed.errors[0].message });
          return;
        }

        const rows = parsed.data.filter((row) => row.name || row.value);
        setFileState(rows.length > 0 ? { status: "ok", rows } : { status: "empty" });
      } catch (err) {
        if (!cancelled) {
          setFileState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not read file",
          });
        }
      }
    }

    void loadFile();

    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <section className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-3xl font-semibold text-indigo-700">Imported data</h1>
        <Card>
          <CardHeader>
            <CardTitle>Rows</CardTitle>
          </CardHeader>
          <CardContent>
            {fileState.status === "loading" && (
              <div className="h-32 rounded-md bg-muted" aria-label="Loading file" />
            )}
            {fileState.status === "error" && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {fileState.message}
              </p>
            )}
            {fileState.status === "empty" && (
              <p className="text-sm text-muted-foreground">No data available.</p>
            )}
            {fileState.status === "ok" && (
              <ul className="space-y-2">
                {fileState.rows.map((row) => (
                  <li key={row.name} className="rounded-md border p-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-2 text-muted-foreground">{row.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
\`\`\`

Example using \`triggerUserFileDownload\`:

\`\`\`tsx
import { triggerUserFileDownload } from "@dust/react-hooks";
import { Button } from "shadcn";

<Button
  variant="outline"
  onClick={() =>
    triggerUserFileDownload({
      content: csvContent,
      filename: "data.csv",
    })
  }
>
  Download CSV
</Button>
\`\`\`
`;

export const INTERACTIVE_CONTENT_FRAME_IMPORT_EXAMPLE_V2 = `\
Example importing another frame as a React component:

\`\`\`tsx
import SalesChart from "fil_abc123";
import RegionMap from "conversation-conv_123/RegionMap.tsx";

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div
        className="mx-auto grid max-w-5xl gap-6"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
      >
        <SalesChart />
        <RegionMap />
      </div>
    </main>
  );
}
\`\`\`
`;

export const INTERACTIVE_CONTENT_CHART_EXAMPLES_V2 = `\
General example of a React component with shadcn/ui ChartContainer:

\`\`\`tsx
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "shadcn";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "shadcn";

const chartData = [
  { month: "Jan", revenue: 420, forecast: 390 },
  { month: "Feb", revenue: 510, forecast: 470 },
  { month: "Mar", revenue: 620, forecast: 560 },
];

const chartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  forecast: { label: "Forecast", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function RevenueFrame() {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <section className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-3xl font-semibold text-indigo-700">Revenue trend</h1>
        <Card>
          <CardHeader>
            <CardTitle>Monthly revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <LineChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="var(--color-forecast)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
\`\`\`

Bar chart with explicit width:

\`\`\`tsx
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
    <XAxis dataKey="month" />
    <YAxis />
    <Tooltip formatter={(value, name) => [value, name]} />
    <Bar dataKey="sales">
      {salesData.map((entry, index) => (
        <Cell key={entry.month} fill={COLORS[index % COLORS.length]} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
\`\`\`
`;
