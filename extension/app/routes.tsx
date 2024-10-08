import { ArrowLeftIcon, BarHeader } from "@dust-tt/sparkle";
import { MainPage } from "./pages/MainPage";
import { Link } from "react-router-dom";
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
