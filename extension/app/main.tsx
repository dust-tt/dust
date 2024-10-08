import React from "react";
import ReactDOM from "react-dom/client";

const App = () => {
  return (
    <div>
      <h1>Soupinou</h1>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
