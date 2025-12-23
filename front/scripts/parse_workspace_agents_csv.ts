import { makeScript } from "@app/scripts/helpers";

interface ToolInfo {
  sId: string | null;
  name: string | null;
  type: string | null;
  internalMCPServerId: string | null;
  remoteMCPServerUrl: string | null;
  remoteMCPServerName: string | null;
  remoteMCPServerDescription: string | null;
  timeFrame: unknown | null;
  additionalConfiguration: unknown | null;
  descriptionOverride: string | null;
}

interface ParsedAgent {
  workspaceName: string;
  agentSid: string;
  agentName: string;
  description: string | null;
  instructions: string | null;
  instructionsLength: number | null;
  tools: ToolInfo[];
  tableIds: string[];
  childAgents: string[];
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        fields.push(current);
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Push the last field
  fields.push(current);

  return fields;
}

function parseJSON<T>(value: string): T | null {
  if (!value || value.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseAgentFromCSV(fields: string[], headers: string[]): ParsedAgent {
  const getValue = (header: string): string => {
    const index = headers.indexOf(header);
    return index >= 0 ? fields[index] : "";
  };

  const instructionsLength = getValue("instructionsLength");

  return {
    workspaceName: getValue("workspaceName"),
    agentSid: getValue("agentSid"),
    agentName: getValue("agentName"),
    description: getValue("description") || null,
    instructions: getValue("instructions") || null,
    instructionsLength: instructionsLength ? parseInt(instructionsLength, 10) : null,
    tools: parseJSON<ToolInfo[]>(getValue("tools")) ?? [],
    tableIds: parseJSON<string[]>(getValue("tableIds")) ?? [],
    childAgents: parseJSON<string[]>(getValue("childAgents")) ?? [],
  };
}

function splitCSVIntoRows(csvContent: string): string[] {
  const rows: string[] = [];
  let currentRow = "";
  let inQuotes = false;
  let i = 0;

  while (i < csvContent.length) {
    const char = csvContent[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < csvContent.length && csvContent[i + 1] === '"') {
          currentRow += '""';
          i += 2;
        } else {
          // End of quoted field
          currentRow += char;
          inQuotes = false;
          i++;
        }
      } else {
        currentRow += char;
        i++;
      }
    } else {
      if (char === '"') {
        currentRow += char;
        inQuotes = true;
        i++;
      } else if (char === "\n") {
        rows.push(currentRow);
        currentRow = "";
        i++;
      } else if (char === "\r") {
        // Skip carriage return
        i++;
      } else {
        currentRow += char;
        i++;
      }
    }
  }

  // Push the last row if not empty
  if (currentRow.trim() !== "") {
    rows.push(currentRow);
  }

  return rows;
}

export function parseAgentsCSV(csvContent: string): ParsedAgent[] {
  const rows = splitCSVIntoRows(csvContent);

  if (rows.length === 0) {
    return [];
  }

  const headers = parseCSVLine(rows[0]);
  const agents: ParsedAgent[] = [];

  for (let i = 1; i < rows.length; i++) {
    const fields = parseCSVLine(rows[i]);
    agents.push(parseAgentFromCSV(fields, headers));
  }

  return agents;
}

makeScript(
  {
    input: {
      type: "string",
      demandOption: true,
      description: "Input CSV file path",
    },
    output: {
      type: "string",
      default: "",
      description:
        "Output file path (optional, defaults to stdout). Use .json extension.",
    },
  },
  async ({ input, output }, logger) => {
    const fs = await import("fs/promises");

    const csvContent = await fs.readFile(input, "utf-8");
    const agents = parseAgentsCSV(csvContent);

    logger.info({ agentCount: agents.length }, "Parsed agents from CSV");

    const jsonOutput = JSON.stringify(agents, null, 2);

    if (output) {
      await fs.writeFile(output, jsonOutput, "utf-8");
      logger.info({ outputPath: output }, "Output written to file");
    } else {
      console.log(jsonOutput);
    }

    logger.info({ agentCount: agents.length }, "Parse completed");
  }
);
