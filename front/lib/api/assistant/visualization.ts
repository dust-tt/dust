import type { ContentFragmentType, ConversationType } from "@dust-tt/types";
import {
  getTablesQueryResultsFileAttachment,
  isAgentMessageType,
  isContentFragmentType,
  isTablesQueryActionType,
  removeNulls,
} from "@dust-tt/types";
import _ from "lodash";
import * as readline from "readline"; // Add this line
import type { Readable } from "stream";

import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";

export async function getVisualizationPrompt({
  auth,
  conversation,
}: {
  auth: Authenticator;
  conversation: ConversationType;
}) {
  const readFirstFiveLines = (inputStream: Readable): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const rl: readline.Interface = readline.createInterface({
        input: inputStream,
        crlfDelay: Infinity,
      });

      let lineCount: number = 0;
      const lines: string[] = [];

      rl.on("line", (line: string) => {
        lines.push(line);
        lineCount++;
        if (lineCount === 5) {
          rl.close();
        }
      });

      rl.on("close", () => {
        resolve(lines);
      });

      rl.on("error", (err: Error) => {
        reject(err);
      });
    });
  };

  const contentFragmentMessages: Array<ContentFragmentType> = [];
  for (const m of conversation.content.flat(1)) {
    if (isContentFragmentType(m)) {
      contentFragmentMessages.push(m);
    }
  }
  const contentFragmentFileBySid = _.keyBy(
    await FileResource.fetchByIds(
      auth,
      removeNulls(contentFragmentMessages.map((m) => m.fileId))
    ),
    "sId"
  );

  const contentFragmentTextByMessageId: Record<string, string[]> = {};
  for (const m of contentFragmentMessages) {
    if (!m.fileId || !m.contentType.startsWith("text/")) {
      continue;
    }

    const file = contentFragmentFileBySid[m.fileId];
    if (!file) {
      continue;
    }
    const readStream = file.getReadStream({
      auth,
      version: "original",
    });
    contentFragmentTextByMessageId[m.sId] =
      await readFirstFiveLines(readStream);
  }

  let prompt = visualizationSystemPrompt.trim() + "\n\n";

  const fileAttachments: string[] = [];
  for (const m of conversation.content.flat(1)) {
    if (isContentFragmentType(m)) {
      if (!m.fileId || !contentFragmentFileBySid[m.fileId]) {
        continue;
      }
      fileAttachments.push(
        `<file id="${m.fileId}" name="${m.title}" type="${m.contentType}" />`
      );
    } else if (isAgentMessageType(m)) {
      for (const a of m.actions) {
        if (isTablesQueryActionType(a)) {
          const attachment = getTablesQueryResultsFileAttachment({
            resultsFileId: a.resultsFileId,
            resultsFileSnippet: a.resultsFileSnippet,
            output: a.output,
            includeSnippet: false,
          });
          if (attachment) {
            fileAttachments.push(attachment);
          }
        }
      }
    }
  }

  if (fileAttachments.length > 0) {
    prompt +=
      "Files accessible to the :::visualization directive environment:\n";
    prompt += fileAttachments.join("\n");
  } else {
    prompt +=
      "No files are currently accessible to the :::visualization directive environment in this conversation.";
  }

  return prompt;
}

export const visualizationSystemPrompt = `\
It is possible to generate visualizations for the user (using React components executed in a react-runner environment) that will be rendered in the user's browser by using the :::visualization container block markdown directive.

Guidelines using the :::visualization tag:
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
  - The content should be responsive
  - The outermost container should have a fixed height between 200 and 600 pixels
  - The component should be able to adapt to different screen sizes
  - The content should never overflow the viewport and should never have horizontal or vertical scrollbars
- Styling:
  - Tailwind's arbitrary values like \`h-[600px]\` must never be used, as they are not available in the visualization environment. No tailwind class that include a square bracket should ever be used in the visualization code, as they will cause the visualization to fail for the user.
  - When arbitrary / specific values are required, regular CSS (using the \`style\` prop) can be used as a fallback.
  - For all other styles, Tailwind CSS classes should be preferred
  - Always use padding around plots to ensure elements are fully visible and labels/legends do not overlap with the plot or with each other.
  - Use a default white background (represented by the Tailwind class bg-white) unless explicitly requested otherwise by the user.
  - If you need to generate a legend for a chart, ensure it uses relative positioning or follows the natural flow of the layout, avoiding \`position: absolute\`, to maintain responsiveness and adaptability.
- Using files from the conversation when available:
 - Files from the conversation can be accessed using the \`useFile()\` hook.
 - Once/if the file is available, \`useFile()\` will return a non-null \`File\` object. The \`File\` object is a browser File object. Examples of using \`useFile\` are available below.
 - Always use \`papaparse\` to parse CSV files.
- Available third-party libraries:
  - Base React is available to be imported. In order to use hooks, they have to be imported at the top of the script, e.g. \`import { useState } from "react"\`
  - The recharts charting library is available to be imported, e.g. \`import { LineChart, XAxis, ... } from "recharts"\` & \`<LineChart ...><XAxis dataKey="name"> ...\`.
  - The papaparse library is available to be imported, e.g. \`import Papa from "papaparse"\` & \`const parsed = Papa.parse(fileContent, {header:true, skipEmptyLines: "greedy"});\`. The \`skipEmptyLines:"greedy"\` configuration should always be used.
  - No other third-party libraries are installed or available to be imported. They cannot be used, imported, or installed.
- Miscellaneous:
  - Images from the web cannot be rendered or used in the visualization (no internet access).
  - When parsing dates, the date format should be accounted for based on the format seen in the \`<attachment/>\` tag.
  - If needed, the application must contain buttons or other navigation elements to allow the user to scroll/cycle through the content.


Example using the \`useFile\` hook:

\`\`\`
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

\`fileId\` can be extracted from the \`<file id="\${FILE_ID}" type... name...>\` tags in the conversation history.

General example of a visualization component:

In response of a user asking a plot of sine and cosine functions the following :::visualization directive can be inlined anywhere in the assistant response:

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
      <h2 className="text-2xl font-bold mb-4 text-center">
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
:::
`;
