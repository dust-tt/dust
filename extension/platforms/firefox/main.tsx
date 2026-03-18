// Tailwind base globals
import "../../ui/css/global.css";
import "@dust-tt/sparkle/dist/sparkle.css";
import "../../ui/css/components.css";
import "../../ui/css/custom.css";
import { datadogLogs } from "@datadog/browser-logs";
import React from "react";
import ReactDOM from "react-dom/client";
import { FirefoxApp } from "./FirefoxApp";

if (process.env.DATADOG_CLIENT_TOKEN) {
  datadogLogs.init({
    clientToken: process.env.DATADOG_CLIENT_TOKEN,
    site: "datadoghq.eu",
    service: "dust-firefox-extension",
    env: process.env.DATADOG_ENV,
    version: process.env.VERSION,
    forwardConsoleLogs: ["error"],
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
  });
}

const logger = datadogLogs.logger;
logger.info("Dust Firefox extension loaded");

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <FirefoxApp />
    </React.StrictMode>
  );
}
