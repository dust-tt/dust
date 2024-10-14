import { ConversationPage } from "@extension/pages/ConversationPage";
import { MainPage } from "@extension/pages/MainPage";

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
