#!/usr/bin/env node

import { ConversationPublicType, DustAPI } from "@dust-tt/client";
import * as path from "path";
import { fileSystem } from "./fs_utils";
import { applyUnifiedDiff } from "./unified_diff";
import { Config, loadConfig, saveConfig } from "./config";

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "config" && args.length === 2) {
    return configCommand(args);
  } else if (cmd && cmd.includes("dust.tt")) {
    const config = await loadConfig();
    return applyCommand(cmd, config);
  }

  console.error("Usage:");
  console.error("  dust-apply config <apiKey> <workspaceId>");
  console.error("  dust-apply <dust.tt assistant URL>");
  process.exit(1);
}

main().catch(console.error);

async function configCommand(args: string[]) {
  await saveConfig({ apiKey: args[0], workspaceId: args[1] });
  console.log("Config saved");
}

async function applyCommand(cmd: string, config: Config) {
  const conversationId = extractConversationId(cmd);

  const api = new DustAPI(
    { url: "https://dust.tt" },
    { apiKey: config.apiKey, workspaceId: config.workspaceId },
    console
  );

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
}

function extractConversationId(url: string): string {
  const match = url.match(/dust\.tt\/w\/[^/]+\/assistant\/([a-zA-Z0-9]+)/);
  if (!match)
    throw new Error(
      "Invalid URL: must be a dust.tt assistant URL (format: dust.tt/w/<workspace>/assistant/<id>)"
    );
  return match[1];
}

async function getEditsFromConversation(
  conversationId: string,
  config: Config
): Promise<
  Array<{ absolutePath: string; unifiedDiff: string; isNewFile: boolean }>
> {
  const api = new DustAPI(
    { url: "https://dust.tt" },
    { apiKey: config.apiKey, workspaceId: config.workspaceId },
    console
  );

  const result = await api.getConversation({ conversationId });
  if (result.isErr()) {
    console.error("Error:", result.error);
    process.exit(1);
  }

  const changeSuggestions = await parseGodChangeSuggestionFormat(result.value);

  // repo path is path_of_this_script/../../../..
  const repoPath = path.join(__dirname, "../../../..");

  const edits = await Promise.all(
    changeSuggestions.map(async (changeSuggestion) => {
      const relativePath = changeSuggestion.file;
      const absolutePath = path.join(repoPath, relativePath);

      const originalFileContent = (await fileSystem.exists(absolutePath))
        ? await fileSystem.readText(absolutePath)
        : "";

      if (!originalFileContent?.length) {
        return {
          absolutePath,
          unifiedDiff: [
            "@@ ... @@",
            "---- /dev/null",
            "+++ new",
            ...changeSuggestion.suggestion.split("\n").map((l) => `+${l}`),
          ].join("\n"),
          isNewFile: true,
        };
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
      return { absolutePath, unifiedDiff, isNewFile: false };
    })
  );

  return edits;
}

async function parseGodChangeSuggestionFormat(
  conversation: ConversationPublicType
) {
  const contents = conversation.content
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
      // parse tag that has this format: <change_suggestion file_path="some/realtive/path/to/file.rs">
      const file = line.split('file_path="')[1].split('"')[0];
      // next line should be "```"
      i += 2;
      let suggestion = "";

      // Stop when we reach the closing "```"
      while (!lines[i].startsWith("```")) {
        suggestion += lines[i] + "\n";
        i++;
      }

      // Add the change suggestion to the list
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

  return changeSuggestions;
}
