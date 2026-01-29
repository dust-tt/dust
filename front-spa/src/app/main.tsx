// Tailwind base globals
import "@dust-tt/front/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "@dust-tt/front/styles/components.css";
// Local index.css for any app-specific overrides
import "@spa/index.css";

import App from "@spa/app/App";
import { initDatadogRUM } from "@spa/lib/initDatadog";
import React from "react";
import ReactDOM from "react-dom/client";

// Initialize Datadog RUM before rendering
initDatadogRUM();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
