#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import meow from "meow";

import { App } from "./ui/App.js";

const cli = meow(
  `
  Usage
    $ dust-code [prompt]

  Options
    --api-key   Dust API key (or set DUST_API_KEY env var)
    --wId       Workspace ID (or set DUST_WORKSPACE_ID env var)
    --cwd       Working directory (default: current directory)

  Examples
    $ dust-code
    $ dust-code "Fix the failing tests in src/utils/"
    $ dust-code --api-key sk-xxx --wId abc123 "Explain the codebase"
`,
  {
    importMeta: import.meta,
    flags: {
      apiKey: {
        type: "string",
      },
      wId: {
        type: "string",
      },
      cwd: {
        type: "string",
        default: process.cwd(),
      },
    },
  }
);

const initialPrompt = cli.input.join(" ") || undefined;
const cwd = cli.flags.cwd;

render(
  <App
    cwd={cwd}
    initialPrompt={initialPrompt}
    apiKey={cli.flags.apiKey}
    wId={cli.flags.wId}
  />
);
