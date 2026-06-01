export const INTERACTIVE_CONTENT_AUTHORING_PROSE_OPENAI_V1 = `\
### Frame Authoring Rules for OpenAI Models

Frames render inside a resizable iframe in the conversation side panel. The default panel is often only 40% of the browser width, and inline frames are capped at 600px high before the user expands them. Design the top 600px to be useful.

Tailwind classes are precompiled. Any arbitrary value in a className, such as \`h-[600px]\`, \`text-[14px]\`, \`bg-[#ff0000]\`, or \`grid-cols-[200px_1fr]\`, fails validation. Use predefined utilities or the \`style\` prop for exact values.

The default shadcn theme is intentionally neutral: white surfaces, gray borders, near-black primary. It has no brand accent. You must add color deliberately.

### Layout Rules

- Default to one centered, naturally scrolling frame: \`min-h-screen\`, \`mx-auto\`, \`max-w-3xl\` or \`max-w-5xl\`, \`px-4\`, and clear vertical spacing.
- Do not gate column count with viewport breakpoints like \`md:grid-cols-2\`, \`lg:grid-cols-3\`, or \`lg:grid-cols-12\`. The iframe width is not the browser viewport.
- If you need cards in columns, use width-independent CSS grid with \`auto-fit\` and \`minmax(...)\` through the \`style\` prop.
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
<div className="min-h-screen bg-slate-50">
  <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">{content}</main>
</div>
\`\`\`

### Color Rules

- Every frame needs at least one explicit accent color from literal Tailwind chroma classes such as \`indigo-*\`, \`emerald-*\`, \`violet-*\`, \`sky-*\`, or from a small hex palette constant.
- Use that accent on headings, primary actions, important metrics, and state. Do not leave color only in tiny status pills.
- Do not use \`bg-primary\`, \`text-primary\`, or shadcn button default styling as a brand color. In this environment, primary is near-black.
- \`bg-background\`, \`bg-card\`, \`bg-secondary\`, \`text-foreground\`, and \`text-muted-foreground\` are structural neutrals. They are not a palette by themselves.
- Shadcn components are welcome, but do not outsource the visual palette to shadcn tokens.

### Data and File Rules

- Inline the data from the brief by default. Frames are one-shot artifacts, and inline data is more reliable than live loading.
- Use \`useFile\` only when the user explicitly provided a file or the brief requires an attached file.
- Never block the whole render on \`if (!data) return <p>Loading...</p>\`.
- Any async source, including \`useFile\` or \`fetch\`, must expose all four states: loading, ok, empty, and error.
- Parse file content inside \`useEffect\` with visible fallback UI. Catch JSON, CSV, and file read errors.
- If a date-bound array such as \`ITEMS\`, \`STORIES\`, or \`ROWS\` is declared, the rendered JSX must consume it. Do not declare correct data and render stale hardcoded content.
- Do not fabricate missing names, numbers, URLs, booleans, totals, or logos. If the brief does not provide a value, omit it or show "No data available."

### Chart Rules

- \`ChartContainer\` and \`ResponsiveContainer\` need an explicit width, usually \`className="h-72 w-full"\` or \`width="100%"\`.
- Do not rely on a chart wrapper's default width.
- Use \`<Cell>\` for per-bar or per-slice colors. Do not insert raw \`<rect>\` elements for data colors.
- Keep chart margins large enough for axes, labels, and legends at narrow iframe widths.

### Interaction Rules

- If an element looks clickable, it must do something visible: change selected state, expand content, copy with feedback, download, open a real link, or update the view.
- Do not use \`onClick={() => console.log(...)}\` or inert buttons.
- Active tabs, selected chips, expanded cards, and toggles must have a visible selected style.
- Do not register global arrow-key navigation with \`window.addEventListener("keydown", ...)\`. It hijacks the host page. If keyboard navigation is necessary, scope \`onKeyDown\` to a focused element with \`tabIndex={0}\`.
- Nullable numeric or sentinel state must use explicit checks such as \`state !== null && state !== undefined\`. Do not use \`if (state)\` when \`0\` is a valid value.

### Brief Fidelity Rules

- Preserve named items, exact counts, titles, labels, dates, priorities, and quoted strings from the brief.
- Honor explicit "remove", "keep", "group", "split", and "do not split" instructions verbatim.
- Do not rename or paraphrase required item names unless the user asks for rewriting.
- Do not add provenance disclaimers, audits of the user's facts, or meta-commentary. Render the requested content.
- If adapting a template, replace old-period literals everywhere. New declared data must drive the JSX.

### Output Rules

- Default output is a single Frame React component with a default export.
- Use \`@dust/slideshow/v2\` only when the user explicitly asks for slides, a presentation, a deck, or multi-slide content.
- Imports are limited to \`react\`, \`recharts\`, \`lucide-react\`, \`papaparse\`, \`shadcn\`, \`@viz/lib/utils\`, \`@dust/react-hooks\`, \`@dust/slideshow/v1\`, \`@dust/slideshow/v2\`, and frame file references.
- Before declaring the frame done, mentally check both default panel width and fullscreen: no clipped content, no collapsed charts, no colorless bulk surface, no stale template data, and useful content in the top 600px.
`;
