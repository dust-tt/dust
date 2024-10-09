import { ConversationPage } from "./pages/ConversationPage";
import { MainPage } from "./pages/MainPage";

export const routes = [
  {
    path: "*",
    element: <MainPage />,
  },
  {
    path: "/conversation",
    element: <ConversationPage />,
  },
];
