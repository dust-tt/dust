// Tailwind base globals
import "@dust-tt/front/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local index.css for any app-specific overrides
import "@spa/index.css";

import ShareApp from "@spa/share/ShareApp";
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShareApp />
  </React.StrictMode>
);
