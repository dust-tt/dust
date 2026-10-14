export const NOOP_TOOL_NAME = "noop";

export const EXCEL_TOOLS_METADATA = [
  {
    name: NOOP_TOOL_NAME,
    description:
      "Does nothing. Use it only to check that the Excel add-in tools are reachable.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Checking Excel tools...",
      done: "Excel tools checked",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;
