import { z } from "zod";
import { execSync } from "child_process";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class ExecuteCommandTool implements McpTool {
  name = "execute_command";
  description = "Execute a shell command (use with caution)";

  inputSchema = z.object({
    command: z.string().describe("The shell command to execute"),
    working_directory: z
      .string()
      .optional()
      .describe("Working directory for the command"),
  });

  async execute({
    command,
    working_directory,
  }: z.infer<typeof this.inputSchema>) {
    try {
      const options = working_directory
        ? { cwd: working_directory, encoding: "utf8" as const }
        : { encoding: "utf8" as const };
      const output = execSync(command, options);
      return {
        content: [
          {
            type: "text" as const,
            text: `Command: ${command}\n\nOutput:\n${output}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error executing command: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}