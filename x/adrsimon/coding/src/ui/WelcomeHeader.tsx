import React from "react";
import { Box, Text } from "ink";
import { execSync } from "child_process";
import { homedir } from "os";

interface WelcomeHeaderProps {
  cwd: string;
}

function getGitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "n/a";
  }
}

function shortenPath(p: string): string {
  const home = homedir();
  if (p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

export function WelcomeHeader({ cwd }: WelcomeHeaderProps) {
  const branch = getGitBranch(cwd);
  const shortCwd = shortenPath(cwd);

  return (
    <Box marginTop={1} marginBottom={1}>
      <Box flexDirection="column" marginRight={2}>
        <Box>
          <Text color="green" dimColor>
            {"█"}
          </Text>
          <Text color="green">{"▀▄ "}</Text>
          <Text color="red" dimColor>
            {"█ █"}
          </Text>
        </Box>
        <Box>
          <Text color="green" dimColor>
            {"█"}
          </Text>
          <Text color="green">{"▄▀ "}</Text>
          <Text color="red">{"█▄█"}</Text>
        </Box>
        <Box>
          <Text color="blue" dimColor>
            {"█▀▀ "}
          </Text>
          <Text color="blue" dimColor>
            {"▀█▀"}
          </Text>
        </Box>
        <Box>
          <Text color="blue">{"▄██ "}</Text>
          <Text color="yellow" dimColor>
            {" █ "}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" justifyContent="center">
        <Text dimColor>
          Dust Coding CLI · {shortCwd}
        </Text>
        <Text dimColor>
          Branch: <Text bold dimColor>{branch}</Text>
          {" · "}Type <Text bold dimColor>/help</Text> for commands
        </Text>
        <Text dimColor>
          Enter to send · \Enter for newline · Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
}
