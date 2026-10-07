import Custom404 from "@app/components/pages/Custom404";
import WorkspacePicker from "@app/components/WorkspacePicker";
import config from "@app/lib/api/config";
import { useSearchParam } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceLookup } from "@app/lib/swr/workspaces";
import { isDevelopment } from "@app/types/shared/env";
import { datadogLogs } from "@datadog/browser-logs";
import {
  BarHeader,
  Button,
  DustLogoSquare,
  Icon,
  LogOut01,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

function signOut() {
  datadogLogs.clearUser();
  window.DD_RUM?.onReady(() => {
    window.DD_RUM?.clearUser();
  });
  window.location.href = `${config.getApiBaseUrl()}/api/workos/logout`;
}

export function NoWorkspacePage() {
  const { t } = useLingui();
  const flow = useSearchParam("flow");
  const { user } = useUser();
  const { workspaceLookup, isWorkspaceLookupLoading } = useWorkspaceLookup({
    flow,
  });

  // Redirect to 404 on error or missing data.
  if (!isWorkspaceLookupLoading && !workspaceLookup) {
    return <Custom404 />;
  }

  if (!workspaceLookup) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { workspace, status, workspaceVerifiedDomain } = workspaceLookup;
  const firstName = user?.firstName;
  const workspaceName = workspace.name;
  const companyName = workspaceVerifiedDomain ?? workspaceName;

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
        title={t`Joining Dust`}
        className="ml-10 lg:ml-0"
        rightActions={
          <div className="flex flex-row items-center">
            {user && shouldShowPicker && (
              <WorkspacePicker user={user} workspace={workspace} />
            )}
            <Button
              label={t`Sign out`}
              icon={LogOut01}
              variant="ghost"
              size="sm"
              onClick={signOut}
            />
          </div>
        }
      />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={DustLogoSquare} size="md" />
          </div>
          <span className="heading-2xl text-foreground">
            <Trans>Hello {firstName}!</Trans>
          </span>
        </div>
        <div>
          {status === "auto-join-disabled" && (
            <div className="flex flex-col gap-4">
              <span className="heading-lg text-muted-foreground">
                <Trans>{companyName} already has a Dust workspace.</Trans>
              </span>
              <span className="copy-md text-muted-foreground">
                <Trans>
                  To join the existing workspace of your company,
                  <span className="font-semibold">
                    {" "}
                    please request an invitation from your <br />
                    colleagues,
                  </span>{" "}
                  then use the link provided in the invitation email to access
                  the workspace.
                </Trans>
              </span>
            </div>
          )}
          {status === "revoked" && (
            <div className="flex flex-col gap-4">
              <span className="heading-lg text-muted-foreground">
                <Trans>
                  You no longer have access to {workspaceName}'s Dust workspace.
                </Trans>
              </span>
              <span className="copy-md text-muted-foreground">
                <Trans>
                  You may have been removed from the workspace or the workspace
                  may have reached its maximum number of users.
                </Trans>
                <br />
                <Trans>
                  Please{" "}
                  <span className="font-semibold">
                    contact the administrator in {workspaceName}
                  </span>{" "}
                  for more information or to add you again.
                </Trans>
              </span>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

export default NoWorkspacePage;
