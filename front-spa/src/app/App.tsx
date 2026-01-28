import { createBrowserRouter, RouterProvider } from "react-router-dom";

import RootLayout from "@dust-tt/front/components/app/RootLayout";

const router = createBrowserRouter([
  {
    path: "/",
    element: <div className="p-8">Main App - Coming Soon</div>,
  },
]);

export default function App() {
  return (
    <RootLayout>
      <RouterProvider router={router} />
    </RootLayout>
  );
}
