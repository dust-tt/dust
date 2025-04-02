#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import meow from "meow";
import App from "./ui/App.js";

const cli = meow({
  importMeta: import.meta,
  autoHelp: false,
  flags: {
    version: {
      type: "boolean",
      shortFlag: "v",
    },
    force: {
      type: "boolean",
      shortFlag: "f",
    },
    help: {
      type: "boolean",
    },
  },
});

render(<App cli={cli} />);
