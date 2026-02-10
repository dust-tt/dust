import fs from "fs/promises";
import { Box, Text } from "ink";
import os from "os";
import path from "path";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

const SKILL_NAME = "dust";

const SKILL_CONTENT = `---
name: ${SKILL_NAME}
description: Call a Dust agent to get information (read a slack thread, a notion URL, a google drive document...), perform an action (post a message to slack, create a calendar event, ...), provide context on any topic regarding Dust (the company, current discussions, customers...) or in general have the Dust agent perform a given task.
---

Access Dust agents that have context on all the company, e.g. recent projects, engineering, sales, marketing, etc., via the Dust CLI non-interactively, e.g.:
\`$ dust chat -a issueBot -m "create an issue for this: ..."\`
\`$ dust chat -a deep-dive -m "Research all info we have on kubernetes probe failures in recent weeks.\`

A conversation with an agent can be continued after the first message using the argument \`-c CONVERSATION_STRING_ID\`. The conversation id will be returned in the JSON result from the initial call.
\`$ dust chat -a issueBot -c 'TdWyn4aDt1' -m "also add a subsequent issue about this: ..."\`

If the tool errors because login is needed, ask the user to perform it manually.
`;

const SkillInit: FC = () => {
  const [status, setStatus] = useState<string>("Installing skill...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function install() {
      try {
        const destDir = path.join(
          os.homedir(),
          ".claude",
          "skills",
          SKILL_NAME
        );
        const destFile = path.join(destDir, "SKILL.md");

        await fs.mkdir(destDir, { recursive: true });
        await fs.writeFile(destFile, SKILL_CONTENT);

        setStatus(
          `Skill "${SKILL_NAME}" installed to ~/.claude/skills/${SKILL_NAME}/`
        );
      } catch (err) {
        setError(`Failed to install skill: ${err}`);
      }
    }

    void install();
  }, []);

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">{status}</Text>
    </Box>
  );
};

export default SkillInit;
