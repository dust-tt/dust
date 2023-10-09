import { Button, KeyIcon, PageHeader } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useCallback, useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function WorkspaceAdmin({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState("");

  const formValidation = useCallback(() => {
    if (workspaceName === owner.name) {
      return false;
    }
    let valid = true;

    if (workspaceName.length == 0) {
      setWorkspaceNameError("");
      valid = false;
      // eslint-disable-next-line no-useless-escape
    } else if (!workspaceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setWorkspaceNameError(
        "Workspace name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setWorkspaceNameError("");
    }
    return valid;
  }, [owner.name, workspaceName]);

  useEffect(() => {
    setDisabled(!formValidation());
  }, [workspaceName, formValidation]);

  const handleUpdateWorkspace = async () => {
    setUpdating(true);
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspaceName,
      }),
    });
    if (!res.ok) {
      window.alert("Failed to update workspace.");
      setUpdating(false);
    } else {
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
    >
      <PageHeader
        title="Workspace Settings"
        icon={KeyIcon}
        description="Use this page to manage your workspace."
      />

      <div className="flex flex-col">
        <div className="space-y-8 pt-8">
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-5">
            <div className="sm:col-span-6">
              <div className="flex justify-between">
                <label
                  htmlFor="appName"
                  className="block text-sm font-medium text-gray-700"
                >
                  Workspace name
                </label>
              </div>
            </div>
            <div className="sm:col-span-3">
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  name="name"
                  id="appName"
                  className={classNames(
                    "block w-full min-w-0 flex-1 rounded-md text-sm",
                    workspaceNameError
                      ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-action-500 focus:ring-action-500"
                  )}
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Think GitHub repository names, short and memorable.
              </p>
            </div>
          </div>

          <div className="mt-4 flex max-w-full flex-row">
            <div className="flex flex-1"></div>
            <div className="flex">
              <Button
                variant="secondary"
                disabled={disable || updating}
                onClick={handleUpdateWorkspace}
                label={updating ? "Updating..." : "Update"}
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
