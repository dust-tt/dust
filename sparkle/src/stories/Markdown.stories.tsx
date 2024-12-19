import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Markdown } from "../index_with_tw_base";

const meta: Meta<typeof Markdown> = {
  title: "Components/Markdown",
  component: Markdown,
  decorators: [
    (Story) => (
      <div className="s-flex s-flex-col s-p-8">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    textColor: {
      options: [
        "s-text-element-800",
        "s-text-element-600",
        "s-text-purple-800",
      ],
      control: { type: "radio" },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const example = `
# Level 1 Title

## Level 2 Title

### Level 3 Title

This is a paragraph with **bold** text and *italic* text. This is \`code\` block:
\`\`\`
Block 
\`\`\`

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

# Another Level 1 Title

Demo of a list, showcasing our pets of the month:
- Soupinou
- Chawarma
- Chalom
- Anakine
- Goose

Ordered list: 
1. Soupinou
2. Chawarma
3. Chalom

---

### Demo of a quote below:

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

Another one, a short one:
> Soupinou fait des miaou miaou.

### Other stuff

~~stuff~~
link www.x.com
footnote [^1]

* [ ] to do
* [x] done


### Table

| Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             |
|-------------|-----------------------|----------------------|-------------------------------|
| October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 26  | 17                    | 12                   | Light showers, overcast       |
| October 27  | 16                    | 10                   | Overcast                      |
| October 28  | 16                    | 9                    | Increasing cloudiness         |
| October 29  | 17                    | 8                    | Scattered clouds              |
| October 30  | 19                    | 8                    | Sunny                         |
| October 31  | 19                    | 10                   | Sunny                         |



### Some lateX

$$ \\sigma(z_i) = \\frac{e^{z_{i}}}{\\sum_{j=1}^K e^{z_{j}}} \\ \\ \\ for\\ i=1,2,\\dots,K $$

### This is a CSV: 

\`\`\`csv
Date,High (°C),Low (°C)
October 24,19,12
October 25,20,12
October 26,17,11
October 27,16,10
October 28,17,11
October 29,18,12
October 30,19,11
\`\`\`

### Some js code :

\`\`\`javascript
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

const data = [
  { date: "Oct 24", high: 19, low: 12 },
  { date: "Oct 25", high: 20, low: 12 },
  { date: "Oct 26", high: 17, low: 11 },
  { date: "Oct 27", high: 16, low: 10 },
  { date: "Oct 28", high: 17, low: 11 },
  { date: "Oct 29", high: 18, low: 12 },
  { date: "Oct 30", high: 19, low: 11 },
];
\`\`\`

### Why not a mermaid graph ?

\`\`\`mermaid
graph TD;
    A[October 24] -->|High: 19°C| B[October 25]
    A -->|Low: 12°C| C[October 26]
    B -->|High: 20°C| D[October 26]
    B -->|Low: 12°C| E[October 27]
    C -->|High: 17°C| F[October 27]
    C -->|Low: 11°C| G[October 28]
    D -->|High: 16°C| H[October 28]
    D -->|Low: 10°C| I[October 29]
    E -->|High: 17°C| J[October 29]
    E -->|Low: 11°C| K[October 30]
    F -->|High: 18°C| L[October 30]
    F -->|Low: 12°C| M[End]
\`\`\`

..End

`;

export const ExtendedMarkdownStory: Story = {
  args: {
    content: example,
    textSize: "base",
    textColor: "s-text-element-800",
  },
};
