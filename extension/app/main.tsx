// Tailwind base globals
import "./src/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "./src/css/components.css";

import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { routes } from "./src/routes";

const router = createBrowserRouter(routes);

const App = () => {
  return <RouterProvider router={router} />;
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
