// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";

// Suppress ResizeObserver loop warnings. This error is benign: it means a
// ResizeObserver callback triggered a layout change that couldn't be delivered
// in the same animation frame. Browsers fire it as a global error event, which
// webpack-dev-server catches and displays as an overlay. It causes no actual
// issue in the app, and is especially common in iframe-embedded UIs where the
// observed element is constrained by the parent page's layout.
window.addEventListener(
  "error",
  (event) => {
    if (
      event.message ===
      "ResizeObserver loop completed with undelivered notifications"
    ) {
      event.stopImmediatePropagation();
    }
  },
  true
);

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
