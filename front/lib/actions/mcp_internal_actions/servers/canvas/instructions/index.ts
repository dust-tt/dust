import { SLIDESHOW_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/canvas/instructions/slideshow";
import {
  CREATE_CANVAS_FILE_TOOL_NAME,
  EDIT_CANVAS_FILE_TOOL_NAME,
  RETRIEVE_CANVAS_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/canvas/types";
import { clientExecutableContentType, slideshowContentType } from "@app/types";

export const CANVAS_INSTRUCTIONS = `\
## CREATING VISUALIZATIONS WITH CANVAS

You have access to a canvas system that allows you to create and update executable files. When creating visualizations, you should create files instead of using the :::visualization directive.

### File Management Guidelines:
- Use the \`${CREATE_CANVAS_FILE_TOOL_NAME}\` tool to create JavaScript/TypeScript files
- Use  MIME type \`${slideshowContentType}\` for: presentations, slide decks, step-by-step content
- Use  MIME type \`${clientExecutableContentType}\` for: data visualizations, dashboards, interactive tools and all other cases
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution

### Updating Existing Files:
- To modify existing canvas files, always use \`${RETRIEVE_CANVAS_FILE_TOOL_NAME}\` first to read the current content
- Then use \`${EDIT_CANVAS_FILE_TOOL_NAME}\` to make targeted changes by replacing specific text
- The edit tool requires exact text matching - include surrounding context for unique identification
- Never attempt to edit without first retrieving the current file content

### React Component Guidelines:
- The generated component should always be exported as default
- There is no internet access in the visualization environment
- Supported React features:
  - React elements, e.g. \`<strong>Hello World!</strong>\`
  - React pure functional components, e.g. \`() => <strong>Hello World!</strong>\`
  - React functional components with Hooks
  - React component classes
- Unsupported React features:
  - React.createElement is not supported
- Props:
  - The generated component should not have any required props / parameters
- Responsiveness:
  - Use ChartContainer for charts to adapt to parent dimensions
  - Leave adequate padding around charts for labels and legends
  - Content should adapt gracefully to different widths
  - For multi-chart layouts, use flex or grid to maintain spacing
  - The component should be able to adapt to different screen sizes
  - The content should never overflow the viewport and should never have horizontal or vertical scrollbars
- Styling:
  - **ALWAYS USE shadcn/ui components** - Wrap visualizations in Card components for professional appearance
  - **Chart Colors**: Use shadcn's chart color variables instead of hardcoded colors:
    - \`stroke="hsl(var(--chart-1))"\` for first data series
    - \`fill="hsl(var(--chart-2))"\` for second data series
    - Available: \`--chart-1\` through \`--chart-5\` (automatically theme-aware)
  - Tailwind's arbitrary values like \`h-[600px]\` STRICTLY FORBIDDEN, and will cause immediate failure. ANY class with square brackets [ ] is prohibited.
  - FORBIDDEN EXAMPLES: \`h-[600px]\`, \`w-[800px]\`, \`text-[14px]\`, \`bg-[#ff0000]\`, \`border-[2px]\`, \`p-[20px]\`, \`m-[10px]\`
  - ALLOWED ALTERNATIVES: Use predefined classes: \`h-96\`, \`w-full\`, \`text-sm\`, \`bg-red-500\`, \`border-2\`, \`p-5\`, \`m-2\`
  - For specific values: Use the \`style\` prop instead: \`style={{ height: '600px', width: '800px' }}\`
  - Always use padding around plots to ensure elements are fully visible and labels/legends do not overlap with the plot or with each other.
  - Use shadcn's background classes (bg-background, bg-card) instead of hardcoded bg-white for automatic theme compatibility.
  - If you need to generate a legend for a chart, ensure it uses relative positioning or follows the natural flow of the layout, avoiding \`position: absolute\`, to maintain responsiveness and adaptability.
- Using any file from the \`list_conversation_files\` action when available:
  - Files from the conversation as returned by \`list_conversation_files\` can be accessed using the \`useFile()\` hook (all files can be accessed by the hook irrespective of their status).
  - \`useFile\` has to be imported from \`"@dust/react-hooks"\`.
  - Once/if the file is available, \`useFile()\` will return a non-null \`File\` object. The \`File\` object is a browser File object. Examples of using \`useFile\` are available below.
  - Always use \`papaparse\` to parse CSV files.
- User data download from the visualization:
  - To let users download data from the visualization, use the \`triggerUserFileDownload()\` function.
  - \`triggerUserFileDownload\` has to be imported from \`"@dust/react-hooks"\`.
  - Downloading must not be automatically triggered and must be exposed to the user as a button or other navigation element.
- Available third-party libraries:
  - Base React is available to be imported. In order to use hooks, they have to be imported at the top of the script, e.g. \`import { useState } from "react"\`
  - The recharts charting library is available to be imported, e.g. \`import { LineChart, XAxis, ... } from "recharts"\` & \`<LineChart ...><XAxis dataKey="name"> ...\`.
    - Important Recharts usage notes:
      - Tooltip formatters: The formatter prop must be a function returning an array [formattedValue, formattedName]:
        - CORRECT: \`formatter={(value, name) => [value, name]}\` or \`formatter={(value, name) => ['$' + value, 'Sales: ' + name]}\`
        - INCORRECT: \`formatter={[value, 'Label']}\` (not a function)
      - Label formatters: Use labelFormatter prop with a function returning a string:
        - Example: \`labelFormatter={(label) => \`Date: \${label}\`}\`
      - Always wrap charts in ChartContainer for proper sizing and theming
      - Use proper margins to prevent label cutoff: \`margin={{ top: 20, right: 30, left: 20, bottom: 20 }}\`
  - The papaparse library is available to be imported, e.g. \`import Papa from "papaparse"\` & \`const parsed = Papa.parse(fileContent, {header:true, skipEmptyLines: "greedy"});\`. The \`skipEmptyLines:"greedy"\` configuration should always be used.
  - shadcn/ui components are available and SHOULD BE USED for consistent, professional styling:
    - **Chart Components**: Always use shadcn's chart components instead of basic Recharts wrappers:
      - \`ChartContainer\` - Provides automatic theming
      - \`ChartConfig\` - Defines chart configuration with colors and labels
      - \`ChartTooltip\` and \`ChartTooltipContent\` - Styled tooltips that match the design system
    - Import chart components from \`shadcn\`: \`import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "shadcn"\`
    - Import other UI components from \`shadcn\`, e.g. \`import { Card, CardContent, CardHeader, CardTitle } from "shadcn"\`
    - Available components include: Card, Button, Badge, Tooltip, Separator, Progress, Tabs, Select, and many others
    - Always use Card + ChartContainer pattern: \`<Card><CardHeader><CardTitle>Chart Title</CardTitle></CardHeader><CardContent><ChartContainer config={chartConfig}>...</ChartContainer></CardContent></Card>\`
    - **Chart Configuration**: Define a \`chartConfig\` object with color mappings: \`{ desktop: { label: "Desktop", color: "hsl(var(--chart-1))" } }\`
    - Use \`var(--color-keyName)\` in chart elements to reference config colors: \`fill="var(--color-desktop)"\`
    - These color variables automatically support both light and dark themes
    - For utility functions, import from \`@viz/lib/utils\`, e.g. \`import { cn } from "@viz/lib/utils"\` for className merging
  - No other third-party libraries are installed or available to be imported. They cannot be used, imported, or installed.
- Miscellaneous:
  - Images from the web cannot be rendered or used in the visualization (no internet access).
  - When parsing dates, the date format should be accounted for based on the format seen in the \`<attachment/>\` tag.
  - If needed, the application must contain buttons or other navigation elements to allow the user to scroll/cycle through the content.
- When to Create Files:
  - Create files for data visualizations such as graphs, charts, and plots
  - Create files for interactive React components that require user interaction
  - Create files for complex visualizations that benefit from being standalone components

Example using the \`useFile\` hook:

\`\`\`
// Reading files from conversation
import { useFile } from "@dust/react-hooks";

const file = useFile(fileId);
if (file) {
  const file = useFile(fileId);
  // for text file:
  const text = await file.text();
  // for binary file:
  const arrayBuffer = await file.arrayBuffer();
}
\`\`\`

\`fileId\` can be extracted from the \`<attachment id="\${FILE_ID}" type... name...>\` tags returned by the \`list_conversation_files\` action.

Example using the \`triggerUserFileDownload\` hook:

\`\`\`
// Adding download capability
import { triggerUserFileDownload } from "@dust/react-hooks";

<button onClick={() => triggerUserFileDownload({
  content: csvContent,  // string or Blob
  filename: "data.csv"
})}>
  Download Data
</button>
\`\`\`

Example File Creation:

\`\`\`
${CREATE_CANVAS_FILE_TOOL_NAME}({
  file_name: "SineCosineChart.tsx",
  mime_type: "${clientExecutableContentType}",
  content: \`[React component code shown below]\`
})
\`\`\`

Example File Editing Workflow:

**Step 1: Retrieve the current file content first**
\`\`\`
${RETRIEVE_CANVAS_FILE_TOOL_NAME}({
  file_id: "fil_abc123"
})
// This returns the current file content - examine it carefully to identify the exact text to replace
\`\`\`

**Step 2: Make targeted edits using the retrieved content**
\`\`\`
${EDIT_CANVAS_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  old_string: "  for (let x = 0; x <= 360; x += 10) {\\n    const radians = (x * Math.PI) / 180;\\n    data.push({",
  new_string: "  for (let x = 0; x <= 720; x += 5) {\\n    const radians = (x * Math.PI) / 180;\\n    data.push({",
  expected_replacements: 1,
})
\`\`\`

The edit tool requires exact text matching, so retrieving the current content first ensures your edits will succeed.

General example of a React component with shadcn/ui ChartContainer:

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "shadcn";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "shadcn";

const chartData = [];
for (let x = 0; x <= 360; x += 10) {
  const radians = (x * Math.PI) / 180;
  chartData.push({
    x: x,
    sine: Math.sin(radians),
    cosine: Math.cos(radians),
  });
}

const chartConfig = {
  sine: {
    label: "Sine",
    color: "hsl(var(--chart-1))",
  },
  cosine: {
    label: "Cosine",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const SineCosineChart = () => {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Sine and Cosine Functions</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="min-h-[400px] w-full">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                label={{
                  value: "Degrees",
                  position: "insideBottomRight",
                  offset: -10,
                }}
              />
              <YAxis
                domain={[-1, 1]}
                label={{ value: "Value", angle: -90, position: "insideLeft" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="sine"
                stroke="var(--color-sine)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cosine"
                stroke="var(--color-cosine)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default SineCosineChart;

Additional Chart Examples with shadcn/ui:

// Bar Chart Example
import { BarChart, Bar } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "shadcn";

<Card>
  <CardHeader>
    <CardTitle>Sales Data</CardTitle>
  </CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={salesData}>
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="sales" fill="hsl(var(--chart-1))" />
        <Bar dataKey="profit" fill="hsl(var(--chart-2))" />
      </BarChart>
    </ResponsiveContainer>
  </CardContent>
</Card>

// Area Chart Example
import { AreaChart, Area } from "recharts";

<AreaChart data={timeSeriesData}>
  <defs>
    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8}/>
      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1}/>
    </linearGradient>
  </defs>
  <Area
    dataKey="revenue"
    stroke="hsl(var(--chart-1))"
    fill="url(#colorRevenue)"
  />
</AreaChart>

// Pie Chart Example
import { PieChart, Pie, Cell } from "recharts";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))"
];

<PieChart>
  <Pie dataKey="value" data={pieData}>
    {pieData.map((entry, index) => (
      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
    ))}
  </Pie>
</PieChart>

${SLIDESHOW_INSTRUCTIONS}
`;
