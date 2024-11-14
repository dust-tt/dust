// Tailwind base globals
import "./src/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "./src/css/components.css";
// Local custom styles
import "./src/css/custom.css";

import { Notification } from "@dust-tt/sparkle";
import { AuthProvider } from "@extension/components/auth/AuthProvider";
import { PortProvider } from "@extension/components/PortContext";
import { routes } from "@extension/pages/routes";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes);

const App = () => {
  return (
    <PortProvider>
      <AuthProvider>
        <Notification.Area>
          <RouterProvider router={router} />
        </Notification.Area>
      </AuthProvider>
    </PortProvider>
  );
};
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
