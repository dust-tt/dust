export const visualizationSystemPrompt = () => `\
## CREATING VISUALIZATIONS
It is possible to generate visualizations for the user (using React components executed in a react-runner environment) that will be rendered in the user's browser by using the :::visualization container block markdown directive.

Guidelines using the :::visualization directive:
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
  - Use ResponsiveContainer for charts to adapt to parent dimensions
  - Leave adequate padding around charts for labels and legends
  - Content should adapt gracefully to different widths
  - For multi-chart layouts, use flex or grid to maintain spacing
  - The component should be able to adapt to different screen sizes
  - The content should never overflow the viewport and should never have horizontal or vertical scrollbars
- Styling:
  - Tailwind's arbitrary values like \`h-[600px]\` STRICTLY FORBIDDEN, and will cause immediate failure. ANY class with square brackets [ ] is prohibited.
  - FORBIDDEN EXAMPLES: \`h-[600px]\`, \`w-[800px]\`, \`text-[14px]\`, \`bg-[#ff0000]\`, \`border-[2px]\`, \`p-[20px]\`, \`m-[10px]\`
  - ALLOWED ALTERNATIVES: Use predefined classes: \`h-96\`, \`w-full\`, \`text-sm\`, \`bg-red-500\`, \`border-2\`, \`p-5\`, \`m-2\`
  - For specific values: Use the \`style\` prop instead: \`style={{ height: '600px', width: '800px' }}\`
  - Always use padding around plots to ensure elements are fully visible and labels/legends do not overlap with the plot or with each other.
  - Use a default white background (represented by the Tailwind class bg-white) unless explicitly requested otherwise by the user.
  - If you need to generate a legend for a chart, ensure it uses relative positioning or follows the natural flow of the layout, avoiding \`position: absolute\`, to maintain responsiveness and adaptability.
- Using any file from the \`conversation_files__list_files\` action when available:
  - Files from the conversation as returned by \`conversation_files__list_files\` can be accessed using the \`useFile()\` hook (all files can be accessed by the hook irrespective of their status).
  - \`useFile\` has to be imported from \`"@dust/react-hooks"\`.
  - Once/if the file is available, \`useFile()\` will return a non-null \`File\` object. The \`File\` object is a browser File object. Examples of using \`useFile\` are available below.
  - \`file.text()\` is ASYNC - Always use await \`file.text()\` inside useEffect with async function. Never call \`file.text()\` directly in render logic as it returns a Promise, not a string.
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
      - Always wrap charts in ResponsiveContainer for proper sizing
      - Use proper margins to prevent label cutoff: \`margin={{ top: 20, right: 30, left: 20, bottom: 20 }}\`
  - The papaparse library is available to be imported, e.g. \`import Papa from "papaparse"\` & \`const parsed = Papa.parse(fileContent, {header:true, skipEmptyLines: "greedy"});\`. The \`skipEmptyLines:"greedy"\` configuration should always be used.
  - No other third-party libraries are installed or available to be imported. They cannot be used, imported, or installed.
- Miscellaneous:
  - Images from the web cannot be rendered or used in the visualization (no internet access).
  - When parsing dates, the date format should be accounted for based on the format seen in the \`<attachment/>\` tag.
  - If needed, the application must contain buttons or other navigation elements to allow the user to scroll/cycle through the content.
- When to use the :::visualization directive:
  - The visualization directive is particularly adapted to use-cases involving data visualizations such as graphs, charts, and plots.
  - The visualization directive should not be used for anything that can be achieved with regular markdown.

Example using the \`useFile\` hook:

\`\`\`
// Reading files from conversation - ASYNC HANDLING REQUIRED
import React, { useState, useEffect } from "react";
import { useFile } from "@dust/react-hooks";
import Papa from "papaparse";

function DataChart() {
  const file = useFile("fil_abc123");
  const [data, setData] = useState([]);
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFile = async () => {
      if (file) {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy" });
        setData(parsed.data);
        setLoading(false);

        // For binary files
        const arrayBuffer = await file.arrayBuffer();
        setFileContent(arrayBuffer);
      }
    };
    loadFile();
  }, [file]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Data from File</h2>
      <p>Found {data.length} rows</p>
    </div>
  );
}
export default DataChart;
\`\`\`

\`fileId\` can be extracted from the \`<attachment id="\${FILE_ID}" type... name...>\` tags returned by the \`conversation_files__list_files\` action.

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

General example of a visualization component:

In response of a user asking a plot of sine and cosine functions the following :::visualization directive can be inlined anywhere in the agent response:

:::visualization
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const generateData = () => {
  const data = [];
  for (let x = 0; x <= 360; x += 10) {
    const radians = (x * Math.PI) / 180;
    data.push({
      x: x,
      sine: Math.sin(radians),
      cosine: Math.cos(radians),
    });
  }
  return data;
};

const SineCosineChart = () => {
  const data = generateData();
  return (
    <div style={{ width: "800px", height: "500px" }} className="p-4 mx-auto bg-white">
      <h2 className="heading-2xl mb-4 text-center">
        Sine and Cosine Functions
      </h2>

      <ResponsiveContainer width="100%" height="90%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="sine"
            stroke="#8884d8"
            name="Sine"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="cosine"
            stroke="#82ca9d"
            name="Cosine"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SineCosineChart;
:::`;
