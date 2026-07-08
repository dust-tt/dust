// Tailwind base globals (preflight/theme/tokens/scrollbar; emits no utilities).
import "../../ui/css/global.css";
// Single unified Tailwind build: scans extension + front + sparkle/src in one
// pass. Replaces the old precompiled `@dust-tt/sparkle/dist/sparkle.css` concat.
import "../../ui/css/components.css";
// Local custom styles (plain CSS; emits no utilities).
import "../../ui/css/custom.css";
import { initDatadogLogs } from "@app/logger/datadogLogger";
import { datadogLogs } from "@datadog/browser-logs";
import React from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import { FirefoxApp } from "./FirefoxApp";

if (process.env.DATADOG_CLIENT_TOKEN) {
  void browser.permissions
    .contains({ data_collection: ["technicalAndInteraction"] })
    .then((granted) => {
      if (granted && process.env.DATADOG_CLIENT_TOKEN) {
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
