#!/usr/bin/env node

import { DustAPI } from "@dust-tt/client";
import * as path from "path";
import * as os from "os";
import { promises as fs, existsSync, readFileSync, writeFileSync } from "fs";
import { fileSystem } from "./fs_utils";
import { applyUnifiedDiff } from "./unified_diff";

const CONFIG_FILE = path.join(os.homedir(), ".dust-apply.json");

interface Config {
  apiKey: string;
  workspaceId: string;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error(
      "Config file not found. Run: dust-apply config <apiKey> <workspaceId>"
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

function saveConfig(config: Config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function extractConversationId(url: string): string {
  const match = url.match(/dust\.tt\/w\/[^/]+\/assistant\/([a-zA-Z0-9]+)/);
  if (!match)
    throw new Error(
      "Invalid URL: must be a dust.tt assistant URL (format: dust.tt/w/<workspace>/assistant/<id>)"
    );
  return match[1];
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "config" && args.length === 2) {
    saveConfig({ apiKey: args[0], workspaceId: args[1] });
    console.log("Config saved");
    return;
  }

  const config = loadConfig();
  const api = new DustAPI(
    { url: "https://dust.tt" },
    { apiKey: config.apiKey, workspaceId: config.workspaceId },
    console
  );

  if (cmd && cmd.includes("dust.tt")) {
    const conversationId = extractConversationId(cmd);
    const result = await api.getConversation({ conversationId });
    if (result.isErr()) {
      console.error("Error:", result.error);
      process.exit(1);
    }
    const contents = result.value.content
      .flatMap((cs) => cs[cs.length - 1])
      // @ts-expect-error -- content is not typed
      .map((c) => c.content)
      .filter(Boolean)
      .join("\n");
    const lines = contents.split("\n");
    type ChangeSuggestion = {
      file: string;
      suggestion: string;
    };
    let changeSuggestions: ChangeSuggestion[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith("<change_suggestion ")) {
        // parse tag that has this format: <change_suggestion file_path="front/pages/w/[wId]/assistant/labs/trackers/index.tsx">
        const file = line.split('file_path="')[1].split('"')[0];
        // next line should be "```"
        i += 2;
        let suggestion = "";
        while (!lines[i].startsWith("```")) {
          suggestion += lines[i] + "\n";
          i++;
        }
        changeSuggestions.push({ file, suggestion });
      }
      i += 1;
    }

    // Only keep last change suggestion per file
    changeSuggestions = Object.values(
      changeSuggestions.reduce(
        (acc, suggestion) => ({
          ...acc,
          [suggestion.file]: suggestion,
        }),
        {} as Record<string, ChangeSuggestion>
      )
    );

    // repo path is path_of_this_script/../../../..
    const repoPath = path.join(__dirname, "../../../..");

    await Promise.all(
      changeSuggestions.map(async (changeSuggestion) => {
        const relativePath = changeSuggestion.file;
        const absolutePath = path.join(repoPath, relativePath);

        const originalFileContent = (await fileSystem.exists(absolutePath))
          ? await fileSystem.readText(absolutePath)
          : "";

        if (!originalFileContent?.length) {
          await fileSystem.writeText(absolutePath, changeSuggestion.suggestion);
          console.log(`Created file ${relativePath}`);
          return;
        }

        const appRes = await api.runApp(
          {
            workspaceId: config.workspaceId,
            appId: "taCGpus05s",
            appSpaceId: "vlt_ZqMdUAzI0OTf",
            appHash:
              "e3470117575ea51dfdc880d78ab5e0432758faba7d1f9fe57ed985851fbaf65f",
          },
          {
            MODEL: {
              provider_id: "anthropic",
              model_id: "claude-3-5-sonnet-20241022",
              function_call: "create_unified_diff",
              use_cache: false,
            },
          },
          [
            {
              file_path: relativePath,
              file_content: originalFileContent,
              change_suggestion: changeSuggestion.suggestion,
            },
          ]
        );

        if (appRes.isErr()) {
          console.error("Error:", appRes.error);
          process.exit(1);
        }

        console.log(`Received model output for ${absolutePath}`);

        const modelOutput = appRes.value.results?.[0]?.[0] as {
          value: {
            content: string;
          };
        };

        if (!modelOutput) {
          console.error("No model output");
          process.exit(1);
        }

        const unifiedDiff = modelOutput.value.content;
        const newContent = applyUnifiedDiff(originalFileContent, unifiedDiff);
        await fileSystem.writeText(absolutePath, newContent);
        console.log(`Applied changes to ${absolutePath}`);
      })
    );

    return;
  }

  console.error("Usage:");
  console.error("  dust-apply config <apiKey> <workspaceId>");
  console.error("  dust-apply <dust.tt assistant URL>");
  process.exit(1);
}

main().catch(console.error);
