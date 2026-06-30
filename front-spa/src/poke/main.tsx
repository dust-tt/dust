// Tailwind base globals
import "@dust-tt/front/styles/global.css";
// Unified Tailwind build (sparkle + front + front-spa sources in one pass)
import "@spa/index.css";

import PokeApp from "@spa/poke/PokeApp";
import React from "react";
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PokeApp />
  </React.StrictMode>
);
