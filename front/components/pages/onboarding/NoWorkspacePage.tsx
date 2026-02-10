import {
  BarHeader,
  DustLogoSquare,
  Icon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceLookup } from "@app/lib/swr/workspaces";
import { isDevelopment } from "@app/types";

export function NoWorkspacePage() {
  const router = useAppRouter();
  const flow = useSearchParam("flow");
  const { user } = useUser();
  const { workspaceLookup, isWorkspaceLookupLoading } = useWorkspaceLookup({
    flow,
  });

  // Redirect to 404 on error or missing data.
  useEffect(() => {
    if (!isWorkspaceLookupLoading && !workspaceLookup) {
      void router.replace("/404");
    }
  }, [isWorkspaceLookupLoading, workspaceLookup, router]);

  if (!workspaceLookup) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { workspace, status, workspaceVerifiedDomain } = workspaceLookup;

  // Show workspace picker if user has multiple WorkOS orgs, or in dev
  // mode fall back to local DB workspaces (no orgs in seeded envs).
  const shouldShowPicker =
    !!(user?.organizations && user.organizations.length > 1) ||
    (isDevelopment() &&
      !user?.organizations?.length &&
      !!user &&
      user.workspaces.length > 1);

  return (
    <Page variant="normal">
      <BarHeader
        title="Joining Dust"
        className="ml-10 lg:ml-0"
        rightActions={
          <div className="flex flex-row items-center">
            {user && shouldShowPicker && (
              <WorkspacePicker user={user} workspace={workspace} />
            )}
            <div>
              {user && (
                <UserMenu user={user} owner={workspace} subscription={null} />
              )}
            </div>
          </div>
        }
      />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={DustLogoSquare} size="md" />
          </div>
          <span className="heading-2xl text-foreground dark:text-foreground-night">
            Hello {user?.firstName}!
          </span>
        </div>
        <div>
          {status === "auto-join-disabled" && (
            <div className="flex flex-col gap-4">
              <span className="heading-lg text-muted-foreground dark:text-muted-foreground-night">
                {workspaceVerifiedDomain ?? workspace.name} already has a Dust
                workspace.
              </span>
              <span className="copy-md text-muted-foreground dark:text-muted-foreground-night">
                To join the existing workspace of your company,
                <span className="font-semibold">
                  {" "}
                  please request an invitation from your <br />
                  colleagues,
                </span>{" "}
                then use the link provided in the invitation email to access the
                workspace.
              </span>
            </div>
          )}
          {status === "revoked" && (
            <div className="flex flex-col gap-4">
              <span className="heading-lg text-muted-foreground dark:text-muted-foreground-night">
                You no longer have access to {workspace.name}'s Dust workspace.
              </span>
              <span className="copy-md text-muted-foreground dark:text-muted-foreground-night">
                You may have been removed from the workspace or the workspace
                may have reached its maximum number of users.
                <br />
                Please{" "}
                <span className="font-semibold">
                  contact the administrator in {workspace.name}
                </span>{" "}
                for more informations or to add you again.
              </span>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

export default NoWorkspacePage;
