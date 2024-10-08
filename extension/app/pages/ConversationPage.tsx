import { ArrowLeftIcon, BarHeader, ChevronLeftIcon } from "@dust-tt/sparkle";
import { Link, useLocation } from "react-router-dom";

export const ConversationPage = () => {
  const pathName = window.location.pathname;
  console.log(pathName);
  return (
    <BarHeader
      title="Conversations"
      leftActions={
        <Link to="/main.html">
          <ChevronLeftIcon />
        </Link>
      }
    />
  );
};
