import "../../src/styles/tailwind.css";
import "./index.css";

import { mountVercelToolbar } from "@vercel/toolbar/vite";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  // Only inject for Vercel preview domains to avoid prompting all visitors.
  if (hostname.endsWith(".vercel.app")) {
    mountVercelToolbar();
  }
}
