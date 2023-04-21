import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useEffect, useState } from "react";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  members: UserType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isAdmin() || owner.type !== "team") {
    return {
      notFound: true,
    };
  }

  const members = await getMembers(auth);

  return {
    props: {
      user,
      owner,
      members,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function NewApp({
  user,
  owner,
  members,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState("");
  const [allowedDomain, setAllowedDomain] = useState(owner.allowedDomain);
  const [allowedDomainError, setAllowedDomainError] = useState("");
  const [inviteLink, setInviteLink] = useState(
    owner.allowedDomain !== null
      ? `https://dust.tt/?signIn=google&wId=${owner.sId}`
      : null
  );

  const formValidation = () => {
    let valid = true;
    if (allowedDomain === null) {
      setAllowedDomainError("");
    } else {
      if (!allowedDomain.match(/^[a-z0-9\.\-]+$/)) {
        setAllowedDomainError("Allowed domain must be a valid domain name.");
        valid = false;
      } else {
        setAllowedDomainError("");
      }
    }

    if (workspaceName.length == 0) {
      setWorkspaceNameError("");
      valid = false;
    } else if (!workspaceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setWorkspaceNameError(
        "Workspace name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setWorkspaceNameError("");
    }
    return valid;
  };

  useEffect(() => {
    setDisabled(!formValidation());
  }, [workspaceName, allowedDomain]);

  const handleUpdateWorkspace = async () => {
    setDisabled(true);
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspaceName,
        allowedDomain: allowedDomain,
      }),
    });
    setDisabled(false);
    if (!res.ok) {
      window.alert("Failed to update workspace.");
    } else {
      setInviteLink(
        allowedDomain !== null
          ? `https://dust.tt/?signIn=google&wId=${owner.sId}`
          : null
      );
      // Hack! non critical.
      owner.name = workspaceName;
    }
  };

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Workspace" owner={owner} />
        </div>
        <div className="flex flex-1">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mt-8 space-y-8 divide-y divide-gray-200">
              <div>
                <h3 className="text-base font-medium leading-6 text-gray-900">
                  Workspace settings
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  A workspace lets you collaborate with your team. Use this
                  panel to manage memberships and generate an invite link for a
                  specific email domain.
                </p>
              </div>
              <div>
                <div className="mt-8 space-y-8">
                  <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-5">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="appName"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Workspace Name
                      </label>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          name="name"
                          id="appName"
                          className={classNames(
                            "block w-full min-w-0 flex-1 rounded-md text-sm",
                            workspaceNameError
                              ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                              : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
                          )}
                          value={workspaceName}
                          onChange={(e) => setWorkspaceName(e.target.value)}
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        Think GitHub repository names, short and memorable.
                      </p>
                    </div>

                    <div className="sm:col-span-3">
                      <div className="flex justify-between">
                        <label
                          htmlFor="appDescription"
                          className="block text-sm font-medium text-gray-700"
                        >
                          Allowed Email Domain
                        </label>
                        <div className="text-sm font-normal text-gray-400">
                          optional
                        </div>
                      </div>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          name="alowedDomain"
                          id="allowedDomain"
                          className={classNames(
                            "block w-full min-w-0 flex-1 rounded-md text-sm",
                            allowedDomainError
                              ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                              : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
                          )}
                          value={allowedDomain || ""}
                          onChange={(e) => {
                            if (e.target.value.length > 0) {
                              setAllowedDomain(e.target.value);
                            } else {
                              setAllowedDomain(null);
                            }
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        Allow users with the specific email domain to join this
                        workspace.
                      </p>
                      {inviteLink ? (
                        <div className="mt-2">
                          <div className="flex justify-between">
                            <span className="block text-sm font-medium text-gray-700">
                              Invite link:{" "}
                              <a
                                className="ml-1 text-violet-600"
                                href={inviteLink}
                              >
                                {inviteLink}
                              </a>
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-row">
                    <div className="flex flex-1"></div>
                    <div className="flex">
                      <Button
                        disabled={disable}
                        type="submit"
                        onClick={handleUpdateWorkspace}
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mt-8 space-y-8">
                  <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-5">
                    <div className="sm:col-span-5">
                      <div className="block text-sm font-medium text-gray-700">
                        Members
                      </div>
                      <ul className="mt-4">
                        {members.map((member) => (
                          <li
                            key={member.id}
                            className="mt-2 flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <div className="">
                                <div className="text-sm font-medium text-gray-900">
                                  {member.name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {member.email}
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-sm text-gray-500">
                              {member.workspaces[0].role}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
