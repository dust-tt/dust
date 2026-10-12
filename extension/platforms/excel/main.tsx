/// <reference types="office-js" />
import "../../ui/css/global.css";
import "../../ui/css/components.css";
import "../../ui/css/custom.css";
import React from "react";
import ReactDOM from "react-dom/client";

import { ExcelApp } from "./ExcelApp";

const renderApp = () => {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ExcelApp />
      </React.StrictMode>
    );
  }
};

void Office.onReady().then(renderApp);
