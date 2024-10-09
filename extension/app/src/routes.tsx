import { MainPage } from "./pages/MainPage";
import { ConversationPage } from "./pages/ConversationPage";

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
