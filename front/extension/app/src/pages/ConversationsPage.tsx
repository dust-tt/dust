import { useAuth } from "@app/extension/app/src/components/auth/AuthProvider";
import { BarHeader, ChevronLeftIcon, Page, Spinner } from "@dust-tt/sparkle";
import { Link, useNavigate } from "react-router-dom";

export const ConversationsPage = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) {
    return (
      <div className="h-full w-full">
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    navigate("/login");
    return;
  }

  const workspace = user.workspaces.find(
    (w) => w.sId === user.selectedWorkspace
  );

  if (!workspace) {
    navigate("/login");
    return;
  }

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
