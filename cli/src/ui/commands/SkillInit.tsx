import fs from "fs/promises";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import os from "os";
import path from "path";
import type { FC } from "react";
import React, { useCallback, useState } from "react";

const SKILL_NAME = "dust";

const SKILL_CONTENT = `---
name: ${SKILL_NAME}
description: Call a Dust agent to get information (read a slack thread, a notion URL, a google drive document...), perform an action (post a message to slack, create a calendar event, ...), provide context on any topic regarding Dust (the company, current discussions, customers...) or in general have the Dust agent perform a given task.
---

Access Dust agents that have context on all the company, e.g. recent projects, engineering, sales, marketing, etc., via the Dust CLI non-interactively, e.g.:
\`$ dust chat -a issueBot -m "create an issue for this: ..."\`
\`$ dust chat -a dust -m "Research all the info we have on Kubernetes probe failures in recent weeks.\`

A conversation with an agent can be continued after the first message using the argument \`-c CONVERSATION_STRING_ID\`. The conversation id will be returned in the JSON result from the initial call.
\`$ dust chat -a issueBot -c 'TdWyn4aDt1' -m "also add a subsequent issue about this: ..."\`

If the tool errors because login is needed, ask the user to perform it manually.
`;

const CLI_TARGETS = [
  {
    id: "claude-code",
    label: "Claude Code",
    dir: path.join(os.homedir(), ".claude", "skills", SKILL_NAME),
  },
  {
    id: "codex",
    label: "Codex (OpenAI)",
    dir: path.join(os.homedir(), ".agents", "skills", SKILL_NAME),
  },
];

const ITEMS = CLI_TARGETS.map((t) => ({
  label: `${t.label} - ${t.dir.replace(os.homedir(), "~")}/`,
  value: t.id,
}));

const SkillInit: FC = () => {
  const [result, setResult] = useState<{
    label: string;
    path: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (item: { label: string; value: string }) => {
      const target = CLI_TARGETS.find((t) => t.id === item.value);
      if (!target) {
        return;
      }

      try {
        const destFile = path.join(target.dir, "SKILL.md");
        await fs.mkdir(target.dir, { recursive: true });
        await fs.writeFile(destFile, SKILL_CONTENT);
        const shortDir = target.dir.replace(os.homedir(), "~");
        setResult({ label: target.label, path: `${shortDir}/` });
      } catch (err) {
        setError(`Failed to install skill: ${err}`);
      }
    },
    []
  );

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (result) {
    return (
      <Box>
        <Text color="green">
          {result.label} - <Text dimColor>{result.path}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Select a target CLI to install the skill for:</Text>
      <SelectInput items={ITEMS} onSelect={handleSelect} />
    </Box>
  );
};

export default SkillInit;
