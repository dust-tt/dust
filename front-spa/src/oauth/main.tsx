// Tailwind base globals
import "@dust-tt/front/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "@dust-tt/front/styles/components.css";
// Local index.css for any app-specific overrides
import "@spa/index.css";

import OAuthApp from "@spa/oauth/OAuthApp";
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OAuthApp />
  </React.StrictMode>
);
