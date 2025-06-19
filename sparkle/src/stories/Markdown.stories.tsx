import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Markdown } from "../index_with_tw_base";

const meta: Meta<typeof Markdown> = {
  title: "Components/Markdown",
  component: Markdown,
  decorators: [(Story) => <Story />],
  argTypes: {
    textColor: {
      options: [
        "s-text-foreground",
        "s-text-muted-foreground",
        "s-text-green-700",
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


### Table

| Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             | Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             | Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             |
|-------------|-----------------------|----------------------|-------------------------------|-------------|-----------------------|----------------------|-------------------------------|-------------|-----------------------|----------------------|-------------------------------|
| October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 26  | 17                    | 12                   | Light showers, overcast       | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 27  | 16                    | 10                   | Overcast                      | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 28  | 16                    | 9                    | Increasing cloudiness         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 29  | 17                    | 8                    | Scattered clouds              | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 30  | 19                    | 8                    | Sunny                         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |
| October 31  | 19                    | 10                   | Sunny                         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |



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

export const ExtendedMarkdownStory: Story = {
  args: {
    content:
      '\n# Level 1 Title\n\n## Level 2 Title\n\n### Level 3 Title\n\nThis is a paragraph with **bold** text and *italic* text. This is `code` block:\n```\nBlock \n```\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n# Another Level 1 Title\n\nDemo of a list, showcasing our pets of the month:\n- Soupinou\n- Chawarma\n- Chalom\n- Anakine\n- Goose\n\nOrdered list: \n1. Soupinou\n2. Chawarma\n3. Chalom\n\n---\n\n### Demo of a quote below:\n\n> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.\n\n> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.\n\nAnother one, a short one:\n> Soupinou fait des miaou miaou.\n\n### Other stuff\n\n~~stuff~~\nlink www.x.com\nfootnote [^1]\n\n* [ ] to do\n* [x] done\n\n### Short Table\n\n| Date        | High Temperature (°C) | Low Temperature (°C) |\n|-------------|-----------------------|----------------------|\n| October 25  | 19                    | 14                   |\n| October 26  | 17                    | 12                   |\n| October 27  | 16                    | 10                   |\n| October 28  | 16                    | 9                    |\n| October 29  | 17                    | 8                    |\n| October 30  | 19                    | 8                    |\n| October 31  | 19                    | 10                   |\n\n\n### Table\n\n| Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             | Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             | Date        | High Temperature (°C) | Low Temperature (°C) | Weather Condition             |\n|-------------|-----------------------|----------------------|-------------------------------|-------------|-----------------------|----------------------|-------------------------------|-------------|-----------------------|----------------------|-------------------------------|\n| October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n| October 26  | 17                    | 12                   | Light showers, overcast       | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n| October 27  | 16                    | 10                   | Overcast                      | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n| October 28  | 16                    | 9                    | Increasing cloudiness         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n| October 29  | 17                    | 8                    | Scattered clouds              | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n| October 30  | 19                    | 8                    | Sunny                         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n| October 31  | 19                    | 10                   | Sunny                         | October 25  | 19                    | 14                   | Passing showers, cloudy       | October 25  | 19                    | 14                   | Passing showers, cloudy       |\n\n\n\n### Some lateX\n\n$$ \\sigma(z_i) = \\frac{e^{z_{i}}}{\\sum_{j=1}^K e^{z_{j}}} \\ \\ \\ for\\ i=1,2,\\dots,K $$\n\n### This is a CSV: \n\n```csv\nDate,High (°C),Low (°C)\nOctober 24,19,12\nOctober 25,20,12\nOctober 26,17,11\nOctober 27,16,10\nOctober 28,17,11\nOctober 29,18,12\nOctober 30,19,11\n```\n\n### Some js code:\n\n```javascript\nimport React from "react";\nimport {\n  LineChart,\n  Line,\n  XAxis,\n  YAxis,\n  CartesianGrid,\n  Tooltip,\n  Legend,\n  ResponsiveContainer,\n} from "recharts";\n\nconst data = [\n  { date: "Oct 24", high: 19, low: 12 },\n  { date: "Oct 25", high: 20, low: 12 },\n  { date: "Oct 26", high: 17, low: 11 },\n  { date: "Oct 27", high: 16, low: 10 },\n  { date: "Oct 28", high: 17, low: 11 },\n  { date: "Oct 29", high: 18, low: 12 },\n  { date: "Oct 30", high: 19, low: 11 },\n];\n\nfunction renderHeader(latitude, longitude) {\n  const container = document.getElementById("dashboard-container");\n  if (!container) {\n    console.error("Dashboard container is missing in the DOM.");\n    return;\n  }\n  let header = document.getElementById("dashboard-header");\n  if (!header) {\n    console.log("Creating new dashboard header.");\n    header = document.createElement("div");\n    header.id = "dashboard-header";\n    container.prepend(header);\n  }\n  console.log("Updating header content.");\n  const currentTime = new Date().toLocaleString("en-US", {\n    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,\n    weekday: "long",\n    hour: "2-digit",\n    minute: "2-digit",\n    second: "2-digit",\n  });\n  header.innerHTML = `\n    <div>\n      <h2>Local Time</h2>\n      <p>${currentTime}</p>\n    </div>\n    <div>\n      <h2>Location</h2>\n      <p>Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}</p>\n    </div>\n  `;\n}\n```\n\n\n### Some CLI code: \n\n```bash\n# Define variables\nAPI_URL="https://api.example.com"\nLATEST_TAG="v1.2.3"\nUSERNAME="user123"\nENVIRONMENT="production"\n\n# Basic GET with variables\ncurl "${API_URL}/version/${LATEST_TAG}"\n\n# POST with JSON payload using variables\ncurl -X POST   -H "Content-Type: application/json"   -d "{\n    "tag": "${LATEST_TAG}",\n    "environment": "${ENVIRONMENT}",\n    "deployedBy": "${USERNAME}"\n  }"   "${API_URL}/deployments"\n```\n\n### Some python code:\n\n```python\nimport datetime\nimport pytz\nfrom typing import List, Dict, Union\nimport tkinter as tk\nfrom tkinter import ttk\nimport matplotlib.pyplot as plt\nfrom matplotlib.figure import Figure\nfrom matplotlib.backends.backend_tkagg import FigureCanvasTkAgg\n\n# Data structure similar to the JavaScript example\ndata = [\n    {"date": "Oct 24", "high": 19, "low": 12},\n    {"date": "Oct 25", "high": 20, "low": 12},\n    {"date": "Oct 26", "high": 17, "low": 11},\n    {"date": "Oct 27", "high": 16, "low": 10},\n    {"date": "Oct 28", "high": 17, "low": 11},\n    {"date": "Oct 29", "high": 18, "low": 12},\n    {"date": "Oct 30", "high": 19, "low": 11},\n]\n\nclass WeatherDashboard:\n    def __init__(self, root: tk.Tk):\n        self.root = root\n        self.root.title("Weather Dashboard")\n        \n        # Create header frame\n        self.header_frame = ttk.Frame(root, padding="10")\n        self.header_frame.grid(row=0, column=0, sticky=(tk.W, tk.E))\n        \n        # Create chart frame\n        self.chart_frame = ttk.Frame(root, padding="10")\n        self.chart_frame.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))\n        \n    def render_header(self, latitude: float, longitude: float) -> None:\n        """\n        Render the dashboard header with time and location information\n        """\n        # Clear existing widgets\n        for widget in self.header_frame.winfo_children():\n            widget.destroy()\n            \n        # Get current time in local timezone\n        current_time = datetime.datetime.now()\n        local_tz = datetime.datetime.now(pytz.timezone(\'UTC\')).astimezone().tzinfo\n        formatted_time = current_time.strftime(\'%A, %I:%M:%S %p\')\n        \n        # Create time section\n        time_frame = ttk.LabelFrame(self.header_frame, text="Local Time")\n        time_frame.grid(row=0, column=0, padx=5, pady=5, sticky=(tk.W))\n        ttk.Label(time_frame, text=formatted_time).grid(row=0, column=0, padx=5, pady=2)\n        \n        # Create location section\n        location_frame = ttk.LabelFrame(self.header_frame, text="Location")\n        location_frame.grid(row=0, column=1, padx=5, pady=5, sticky=(tk.W))\n        ttk.Label(\n            location_frame, \n            text=f"Lat: {latitude:.2f}, Lon: {longitude:.2f}"\n        ).grid(row=0, column=0, padx=5, pady=2)\n        \n    def create_chart(self) -> None:\n        """\n        Create a line chart using matplotlib\n        """\n        # Create figure and axis\n        fig = Figure(figsize=(8, 4))\n        ax = fig.add_subplot(111)\n        \n        # Extract data for plotting\n        dates = [d[\'date\'] for d in data]\n        highs = [d[\'high\'] for d in data]\n        lows = [d[\'low\'] for d in data]\n        \n        # Plot lines\n        ax.plot(dates, highs, marker=\'o\', label=\'High\', color=\'red\')\n        ax.plot(dates, lows, marker=\'o\', label=\'Low\', color=\'blue\')\n        \n        # Customize chart\n        ax.grid(True)\n        ax.set_xlabel(\'Date\')\n        ax.set_ylabel(\'Temperature\')\n        ax.legend()\n        \n        # Rotate x-axis labels for better readability\n        plt.setp(ax.get_xticklabels(), rotation=45)\n        \n        # Create canvas and add to frame\n        canvas = FigureCanvasTkAgg(fig, master=self.chart_frame)\n        canvas.draw()\n        canvas.get_tk_widget().grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))\n\ndef main():\n    root = tk.Tk()\n    dashboard = WeatherDashboard(root)\n    \n    # Example coordinates (Paris)\n    dashboard.render_header(48.8566, 2.3522)\n    dashboard.create_chart()\n    \n    # Configure grid weights\n    root.columnconfigure(0, weight=1)\n    root.rowconfigure(1, weight=1)\n    \n    # Start the application\n    root.mainloop()\n\nif __name__ == "__main__":\n    main()\n\n```\n\n### And some mermaids:\n\n```mermaid\ngraph TD\n          A[Christmas] -->|Get money| B(Go shopping)\n          B --> C{Let me think}\n          B --> G[/Another/]\n          C ==>|One| D[Laptop]\n          C -->|Two| E[iPhone]\n          C -->|Three| F[fa:fa-car Car]\n          subgraph section\n            C\n            D\n            E\n            F\n            G\n          end\n```\n\n```mermaid pie chart\npie title Distribution\n    "Category A" : 30\n    "Category B" : 20\n    "Category C" : 15\n    "Category D" : 10\n    "Category E" : 25\n```\n\n### Images Are Not Displayed Via Markdown:\n![a](test.com)',
  },
};
