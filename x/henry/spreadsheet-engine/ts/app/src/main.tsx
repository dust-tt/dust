import "@dust-tt/sparkle/dist/sparkle.css";
import "./index.css";

import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

// No StrictMode: useEngineClient owns a real OS resource (a worker) created
// during render, and StrictMode's double-invocation would orphan one.
createRoot(root).render(React.createElement(App));
