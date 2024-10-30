import type { ProtectedRouteChildrenProps } from "@app/extension/app/src/components/auth/ProtectedRoute";
import { BarHeader, ChevronLeftIcon, Page } from "@dust-tt/sparkle";
import { Link } from "react-router-dom";

export const ConversationsPage = ({
  workspace,
}: ProtectedRouteChildrenProps) => {
  console.log(workspace);

  return (
    <>
      <BarHeader
        title="Home"
        leftActions={
          <Link to="/">
            <ChevronLeftIcon />
          </Link>
        }
      />
      <div className="h-full w-full pt-4">
        <Page.SectionHeader title="Conversations" />
        Soupinou
      </div>
    </>
  );
};
