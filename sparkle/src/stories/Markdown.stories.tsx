import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect, waitFor } from "storybook/test";

import { Markdown } from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/Markdown",
  component: Markdown,
  parameters: {
    docs: {
      description: {
        component: `Renders agent message bodies from a Markdown \`content\` string. Supports the full GitHub-flavored set — headings, lists, task lists, tables, blockquotes, links, and footnotes — plus fenced code (via **CodeBlock**), LaTeX math, CSV/JSON pretty-printing, and Mermaid diagrams. Typography can be tuned with \`textColor\` and \`forcedTextSize\`.

**When to use**
- To display formatted text produced by an agent, wherever rich content (code, tables, math, diagrams) may appear.

**Guidelines**
- Pass raw Markdown through \`content\`; the component handles escaping and rendering, so avoid pre-formatting to HTML.
- Use \`forcedTextSize\` to match the surrounding context (e.g. inside an **ActionCardBlock** detail section).
- Code fences are delegated to **CodeBlock**; rely on language hints (\`ts\`, \`json\`) for correct highlighting and formatting.`,
      },
    },
  },
  tags: ["a11y-issues", "autodocs"],
  decorators: [(Story) => <Story />],
  argTypes: {
    textColor: {
      options: ["text-foreground", "text-muted-foreground", "text-green-700"],
      control: { type: "radio" },
    },
  },
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const textFormattingContent = `
# Level 1 Title

## Level 2 Title

### Level 3 Title

#### Level 4 Title

##### Level 5 Title

###### Level 6 Title

This is a paragraph with **bold** text and *italic* text, plus some inline \`code\`.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Unordered list:
- Apples
- Oranges
- Pears
- Plums
- Cherries

Ordered list:
1. First step
2. Second step
3. Third step

Task list:
* [ ] to do
* [x] done

~~Strikethrough~~ and a bare link www.x.com

---

### A quote

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

Another one, a short one:
> Less is more.
`;

/**
 * The core GitHub-flavored text features an agent message may contain:
 * all heading levels, emphasis, inline code, lists, task lists,
 * strikethrough, autolinks, horizontal rules, and blockquotes.
 * @summary Headings, emphasis, lists, and quotes.
 */
export const TextFormatting: Story = {
  args: {
    content: textFormattingContent,
  },
};

const taskListContent = `
### Bulleted tasks

- [x] Pull the Q3 deals
- [x] Read the account notes
- [ ] Review the support history
- [ ] Write the briefs

### Numbered tasks

1. [x] Pull the Q3 deals
2. [x] Read the account notes
3. [ ] Review the support history
4. [ ] Write the briefs
`;

/**
 * GFM task lists in both variants: the default checkboxes, meant for content
 * the user can edit, and the read-only "step" circles, numbered inside
 * ordered lists, meant for progress the agent reports (e.g. a plan).
 * @summary Checkbox vs step task lists.
 */
export const TaskLists: Story = {
  args: {
    content: taskListContent,
  },
  render: (args) => (
    <div className="grid grid-cols-2 gap-8">
      <div>
        <p className="heading-sm pb-2 text-muted-foreground">
          taskListVariant="checkbox" (default)
        </p>
        <Markdown {...args} taskListVariant="checkbox" />
      </div>
      <div>
        <p className="heading-sm pb-2 text-muted-foreground">
          taskListVariant="step"
        </p>
        <Markdown {...args} taskListVariant="step" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      // The checkbox variant renders 8 checkboxes, the step variant none.
      expect(canvasElement.querySelectorAll('[role="checkbox"]')).toHaveLength(
        8
      );
      // Step badges expose their state, numbered only inside ordered lists.
      const badges = Array.from(
        canvasElement.querySelectorAll('[role="img"]')
      ).map((badge) => badge.getAttribute("aria-label"));
      expect(badges).toEqual([
        "Done",
        "Done",
        "To do",
        "To do",
        "Done",
        "Done",
        "Step 3",
        "Step 4",
      ]);
    });
  },
};

const tablesContent = `
### Short Table

| Date        | High Temperature (°C) | Low Temperature (°C) |
|-------------|-----------------------|----------------------|
| October 25  | 19                    | 14                   |
| October 26  | 17                    | 12                   |
| October 27  | 16                    | 10                   |
| October 28  | 16                    | 9                    |
| October 29  | 17                    | 8                    |
| October 30  | 19                    | 8                    |
| October 31  | 19                    | 10                   |


### Wide Table

| Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             | Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             | Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             |
|-------------|-----------------------|----------------------|-------------------------------|-------------|-----------------------|----------------------|-------------------------------|-------------|-----------------------|----------------------|-------------------------------|
| October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 26  | 17                    | 12                   | Light showers, overcast       | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 27  | 16                    | 10                   | Overcast                      | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 28  | 16                    | 9                    | Increasing cloudiness         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 29  | 17                    | 8                    | Scattered clouds              | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 30  | 19                    | 8                    | Sunny                         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 31  | 19                    | 10                   | Sunny                         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
`;

/**
 * GFM tables at two widths: a compact table that fits the message column,
 * and a very wide one exercising horizontal overflow handling.
 * @summary Compact and overflowing tables.
 */
export const Tables: Story = {
  args: {
    content: tablesContent,
  },
};

const codeBlocksContent = `
A plain fence with no language hint:
\`\`\`
Block
\`\`\`

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

### Some js code:

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

function renderHeader(latitude, longitude) {
  const container = document.getElementById("dashboard-container");
  if (!container) {
    console.error("Dashboard container is missing in the DOM.");
    return;
  }
  let header = document.getElementById("dashboard-header");
  if (!header) {
    console.log("Creating new dashboard header.");
    header = document.createElement("div");
    header.id = "dashboard-header";
    container.prepend(header);
  }
  console.log("Updating header content.");
  const currentTime = new Date().toLocaleString("en-US", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  header.innerHTML = \`
    <div>
      <h2>Local Time</h2>
      <p>\${currentTime}</p>
    </div>
    <div>
      <h2>Location</h2>
      <p>Lat: \${latitude.toFixed(2)}, Lon: \${longitude.toFixed(2)}</p>
    </div>
  \`;
}
\`\`\`


### Some CLI code:

\`\`\`bash
# Define variables
API_URL="https://api.example.com"
LATEST_TAG="v1.2.3"
USERNAME="user123"
ENVIRONMENT="production"

# Basic GET with variables
curl "\${API_URL}/version/\${LATEST_TAG}"

# POST with JSON payload using variables
curl -X POST \
  -H "Content-Type: application/json" \
  -d "{
    "tag": "\${LATEST_TAG}",
    "environment": "\${ENVIRONMENT}",
    "deployedBy": "\${USERNAME}"
  }" \
  "\${API_URL}/deployments"
\`\`\`

### Some python code:

\`\`\`python
import datetime
import pytz
from typing import List, Dict, Union
import tkinter as tk
from tkinter import ttk
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# Data structure similar to the JavaScript example
data = [
    {"date": "Oct 24", "high": 19, "low": 12},
    {"date": "Oct 25", "high": 20, "low": 12},
    {"date": "Oct 26", "high": 17, "low": 11},
    {"date": "Oct 27", "high": 16, "low": 10},
    {"date": "Oct 28", "high": 17, "low": 11},
    {"date": "Oct 29", "high": 18, "low": 12},
    {"date": "Oct 30", "high": 19, "low": 11},
]

class WeatherDashboard:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Weather Dashboard")

        # Create header frame
        self.header_frame = ttk.Frame(root, padding="10")
        self.header_frame.grid(row=0, column=0, sticky=(tk.W, tk.E))

        # Create chart frame
        self.chart_frame = ttk.Frame(root, padding="10")
        self.chart_frame.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

    def render_header(self, latitude: float, longitude: float) -> None:
        """
        Render the dashboard header with time and location information
        """
        # Clear existing widgets
        for widget in self.header_frame.winfo_children():
            widget.destroy()

        # Get current time in local timezone
        current_time = datetime.datetime.now()
        local_tz = datetime.datetime.now(pytz.timezone('UTC')).astimezone().tzinfo
        formatted_time = current_time.strftime('%A, %I:%M:%S %p')

        # Create time section
        time_frame = ttk.LabelFrame(self.header_frame, text="Local Time")
        time_frame.grid(row=0, column=0, padx=5, pady=5, sticky=(tk.W))
        ttk.Label(time_frame, text=formatted_time).grid(row=0, column=0, padx=5, pady=2)

        # Create location section
        location_frame = ttk.LabelFrame(self.header_frame, text="Location")
        location_frame.grid(row=0, column=1, padx=5, pady=5, sticky=(tk.W))
        ttk.Label(
            location_frame,
            text=f"Lat: {latitude:.2f}, Lon: {longitude:.2f}"
        ).grid(row=0, column=0, padx=5, pady=2)

    def create_chart(self) -> None:
        """
        Create a line chart using matplotlib
        """
        # Create figure and axis
        fig = Figure(figsize=(8, 4))
        ax = fig.add_subplot(111)

        # Extract data for plotting
        dates = [d['date'] for d in data]
        highs = [d['high'] for d in data]
        lows = [d['low'] for d in data]

        # Plot lines
        ax.plot(dates, highs, marker='o', label='High', color='red')
        ax.plot(dates, lows, marker='o', label='Low', color='blue')

        # Customize chart
        ax.grid(True)
        ax.set_xlabel('Date')
        ax.set_ylabel('Temperature')
        ax.legend()

        # Rotate x-axis labels for better readability
        plt.setp(ax.get_xticklabels(), rotation=45)

        # Create canvas and add to frame
        canvas = FigureCanvasTkAgg(fig, master=self.chart_frame)
        canvas.draw()
        canvas.get_tk_widget().grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

def main():
    root = tk.Tk()
    dashboard = WeatherDashboard(root)

    # Example coordinates (Paris)
    dashboard.render_header(48.8566, 2.3522)
    dashboard.create_chart()

    # Configure grid weights
    root.columnconfigure(0, weight=1)
    root.rowconfigure(1, weight=1)

    # Start the application
    root.mainloop()

if __name__ == "__main__":
    main()

\`\`\`
`;

/**
 * Fenced code delegated to **CodeBlock**: a plain fence, CSV
 * pretty-printing, and syntax highlighting for JavaScript, bash, and
 * Python.
 * @summary Fenced code and CSV rendering.
 */
export const CodeBlocks: Story = {
  args: {
    content: codeBlocksContent,
  },
};

const mathAndLatexContent = `
### Some LaTeX

$$ \\sigma(z_i) = \\frac{e^{z_{i}}}{\\sum_{j=1}^K e^{z_{j}}} \\ \\ \\ for\\ i=1,2,\\dots,K $$

### Some inline LaTeX

**Example**: Linear attention is a 2-level optimization:
- Inner level: Memory matrix $\\mathcal{M}_t = \\mathcal{M}_{t-1} + \\mathbf{v}_t \\mathbf{k}_t^\\top$ (updates every token)
- Outer level: Projection matrices $W_k, W_v, W_q$ (updates during pre-training)

Even **optimizers** are associative memories. Momentum with gradient descent is 2-level:
- Momentum $\\mathbf{m}_t$ compresses past gradients
- Weights $W_t$ are updated by momentum

The result is $a=2+t$

### Some text with dollars signs:

One want to import $USER_WORKSPACE but it will cost them $3.5 or $100 $1000

-> The EF for this code is 0.49059 kgCO2e per $ (2018 USD).
-> This code is 0.54895 kgCO2e per $ (2018 USD) more.
-> This thing is $5-$10 range.
`;

/**
 * LaTeX rendering in both display ($$…$$) and inline ($…$) form, plus
 * prose full of literal dollar signs that must not be mistaken for math
 * delimiters.
 * @summary Display and inline LaTeX, dollar-sign disambiguation.
 */
export const MathAndLatex: Story = {
  args: {
    content: mathAndLatexContent,
  },
};

const mermaidContent = `
### And some mermaids:

\`\`\`mermaid
graph TD
          A[Christmas] -->|Get money| B(Go shopping)
          B --> C{Let me think}
          B --> G[/Another/]
          C ==>|One| D[Laptop]
          C -->|Two| E[iPhone]
          C -->|Three| F[fa:fa-car Car]
          subgraph section
            C
            D
            E
            F
            G
          end
\`\`\`

\`\`\`mermaid pie chart
pie title Distribution
    "Category A" : 30
    "Category B" : 20
    "Category C" : 15
    "Category D" : 10
    "Category E" : 25
\`\`\`
`;

/**
 * Mermaid fences rendered as live diagrams — a flowchart with a subgraph
 * and a pie chart. The play function asserts the diagram SVG actually
 * mounts.
 * @summary Mermaid flowchart and pie chart.
 */
export const MermaidDiagrams: Story = {
  args: {
    content: mermaidContent,
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector(".mermaid svg")).not.toBeNull();
    });
  },
};

const footnotesContent = `
Footnote references in text link down to their definitions at the end of the message.

- A first claim backed by a source. [^1]
- A second claim backed by another source. [^2]

If a reference like [^1] appears without escaping, it renders as a superscript link.

[^1]: First footnote content here.
[^2]: Second footnote content here.
`;

/**
 * GFM footnotes: superscript references in the body linking to their
 * definitions rendered at the bottom of the message.
 * @summary Footnote references and definitions.
 */
export const Footnotes: Story = {
  args: {
    content: footnotesContent,
  },
};

const validJSONContent = `
\`\`\`json
{
  "message": "Request completed",
  "status": "success",
  "data": null
}
\`\`\`

\`\`\`json
{
  "query": "SELECT COUNT() FROM Account"
}
\`\`\`

\`\`\`json
{
  "records": [
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v57.0/sobjects/Account/001Qy00000ccRXcIAM"
      },
      "Name": "Awesome Company",
      "Type": "Customer - Direct",
      "Industry": "Apparel",
      "BillingCountry": "USA"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v57.0/sobjects/Account/001Qy00000ccRXeIAM"
      },
      "Name": "Awesomest Company",
      "Type": "Customer - Channel",
      "Industry": "Consulting",
      "BillingCountry": "USA"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v57.0/sobjects/Account/001Qy00000ccRXbIAM"
      },
      "Name": "Awesomer Company",
      "Type": "Customer - Direct",
      "Industry": "Electronics",
      "BillingCountry": null
    }
  ],
  "totalSize": 18,
  "done": true
}
\`\`\`
`;

/**
 * Valid \`json\` fences of increasing size are pretty-printed — small
 * payloads, a one-key query object, and a nested API response.
 * @summary Pretty-printed JSON code fences.
 */
export const JSONPrettyPrinting: Story = {
  args: {
    content: validJSONContent,
  },
};

const invalidJSONContent = `
\`\`\`json
{
  "message": "Invalid JSON should not be pretty printed",
  "status": "success",
}
\`\`\`
`;

/**
 * A \`json\` fence with a deliberate trailing comma: parsing fails, so the
 * block must fall back to plain code rendering instead of crashing or
 * pretty-printing.
 * @summary Graceful fallback for malformed JSON.
 */
export const InvalidJSONHandling: Story = {
  args: {
    content: invalidJSONContent,
  },
};
