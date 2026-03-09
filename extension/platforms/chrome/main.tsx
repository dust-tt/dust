// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";
import { datadogLogs } from "@datadog/browser-logs";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChromeApp } from "./ChromeApp";

if (process.env.DATADOG_CLIENT_TOKEN) {
  datadogLogs.init({
    clientToken: process.env.DATADOG_CLIENT_TOKEN,
    site: "datadoghq.eu",
    service: "dust-chrome-extension",
    env: process.env.DATADOG_ENV,
    version: process.env.VERSION,
    forwardConsoleLogs: ["error"],
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
  });
}

const logger = datadogLogs.logger;
logger.info("Dust extension loaded");

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ChromeApp />
    </React.StrictMode>
  );
}
