// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";
import { initDatadogLogs } from "@app/logger/datadogLogger";
import { datadogLogs } from "@datadog/browser-logs";
import React from "react";
import ReactDOM from "react-dom/client";
import { FirefoxApp } from "./FirefoxApp";

if (process.env.DATADOG_CLIENT_TOKEN) {
  initDatadogLogs({
    clientToken: process.env.DATADOG_CLIENT_TOKEN,
    service: "dust-firefox-extension",
    env: process.env.DATADOG_ENV,
    version: process.env.DUST_EXTENSION_VERSION,
    forwardConsoleLogs: ["error"],
  });
  datadogLogs.setGlobalContext({
    extensionVersion: process.env.DUST_EXTENSION_VERSION,
    commitHash: process.env.COMMIT_HASH,
  });
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <FirefoxApp />
    </React.StrictMode>
  );
}
