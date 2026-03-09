// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";

import { FrontApp } from "@extension/platforms/front/FrontApp";
import React from "react";
import ReactDOM from "react-dom/client";

// Render the app.
const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <FrontApp />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Error rendering Dust app:", error);
  }
} else {
  console.error("Root element not found");
}
