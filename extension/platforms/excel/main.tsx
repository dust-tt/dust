// Tailwind base globals (preflight/theme/tokens/scrollbar; emits no utilities).
import "../../ui/css/global.css";
// Single unified Tailwind build: scans extension + front + sparkle/src in one
// pass. Replaces the old precompiled `@dust-tt/sparkle/dist/sparkle.css` concat.
import "../../ui/css/components.css";
// Local custom styles (plain CSS; emits no utilities).
import "../../ui/css/custom.css";

import { initDatadogLogs } from "@app/logger/datadogLogger";
import logger from "@app/logger/logger";
import { datadogLogs } from "@datadog/browser-logs";
import { ExcelApp } from "@extension/platforms/excel/ExcelApp";
import { restoreHistoryApi } from "@extension/platforms/excel/services/history_api";
import React from "react";
import ReactDOM from "react-dom/client";

if (process.env.DATADOG_CLIENT_TOKEN) {
  initDatadogLogs({
    clientToken: process.env.DATADOG_CLIENT_TOKEN,
    service: "dust-excel-extension",
    env: process.env.DATADOG_ENV,
    version: process.env.DUST_EXTENSION_VERSION,
    forwardConsoleLogs: ["error"],
  });
  datadogLogs.setGlobalContext({
    extensionVersion: process.env.DUST_EXTENSION_VERSION,
    commitHash: process.env.COMMIT_HASH,
  });
}

// Render the app.
const render = () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    logger.error("Root element not found.");
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ExcelApp />
      </React.StrictMode>
    );
  } catch (error) {
    logger.error({ err: error }, "Error rendering Dust app.");
  }
};

// Office.js must finish initializing before anything touches `Office.context`
// or `Excel.run`, so the whole app is mounted from the `onReady` callback.
//
// `Office.onReady` never resolves outside an Office host, which is exactly the
// case when the task pane is opened directly in a browser for development. Race
// it against a timeout so the app still renders there — the platform is not
// Excel, so the workbook tools simply report that the Excel API is unavailable.
const DEV_FALLBACK_TIMEOUT_MS = 1500;

void Promise.race([
  Office.onReady(),
  new Promise((resolve) => setTimeout(resolve, DEV_FALLBACK_TIMEOUT_MS)),
]).then(() => {
  // office.js has disabled `history.pushState`/`replaceState` by now, and the
  // shared `front` routing hooks call them during render.
  restoreHistoryApi();
  render();
});
