import { Listbox } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useEffect, useState } from "react";
import { mutate } from "swr";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useMembers,useWorkspaceInvitations} from "@app/lib/swr";
import { classNames, isEmailValid } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "", URL = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
  url: string;
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

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      url: URL,
    },
  };
};

export default function NewApp({
  user,
  owner,
  gaTrackingId,
  url,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState("");
  const [allowedDomain, setAllowedDomain] = useState(owner.allowedDomain);
  const [allowedDomainError, setAllowedDomainError] = useState("");
  const [inviteLink, setInviteLink] = useState(
    owner.allowedDomain !== null
      ? `${url}/?signIn=google&wId=${owner.sId}`
      : null
  );
  const [inviteEmail, setInviteEmail] = useState("");

  let { members, isMembersLoading } = useMembers(owner);
  let { invitations, isInvitationsLoading } = useWorkspaceInvitations(owner);

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
        allowedDomain !== null ? `${url}/?signIn=google&wId=${owner.sId}` : null
      );
      // Hack! non critical.
      owner.name = workspaceName;
    }
  };

  const handleSendInvitation = async () => {
    const res = await fetch(`/api/w/${owner.sId}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inviteEmail,
      }),
    });
    if (!res.ok) {
      window.alert("Failed to invite new member to workspace.");
    } else {
      mutate(`/api/w/${owner.sId}/invitations`);
    }
  }

  const handleRevokeInvitation = async (invitationId: int) => {
    const res = await fetch(`/api/w/${owner.sId}/invitations/${invitationId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "revoked",
      }),
    });
    if (!res.ok) {
      window.alert("Failed to revoke member's invitation.");
    } else {
      mutate(`/api/w/${owner.sId}/invitations`);
    }
  }

  const handleMemberRoleChange = async (member: UserType, role: string) => {
    const res = await fetch(`/api/w/${owner.sId}/members/${member.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role,
      }),
    });
    if (!res.ok) {
      window.alert("Failed to update membership.");
    } else {
      mutate(`/api/w/${owner.sId}/members`);
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
                  <div className="mt-6 grid grid-cols-1 gap-x-4 sm:grid-cols-5">
                    <div className="sm:col-span-6" >
                      <label
                          htmlFor="appName"
                          className="block text-sm font-medium text-gray-700"
                        >
                        Workspace Name
                      </label>
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
                </div>
              </div>
              <div>
                <div className="mt-8 space-y-8">
                  <div className="mt-6 grid grid-cols-1 gap-x-4 sm:grid-cols-5">
                    <div className="sm:col-span-6">
                      <label
                          htmlFor="appName"
                          className="block text-sm font-medium text-gray-700"
                        >
                        Invite link on specific email domain
                      </label>
                    </div>
                    <div className="sm:col-span-3">
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
                    <div className="sm:col-span-3">
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
                </div>
                <div className="mt-8 space-y-8">
                  <div className="mt-6 grid grid-cols-1 gap-x-4 sm:grid-cols-5">
                    <div className="sm:col-span-6">
                      <label
                          htmlFor="appName"
                          className="block text-sm font-medium text-gray-700"
                        >
                        Invite per email
                      </label>
                    </div>
                    <div className="sm:col-span-3">
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          name="inviteEmail"
                          id="inviteEmail"
                          className={classNames(
                            "block w-full min-w-0 flex-1 rounded-md text-sm",
                            allowedDomainError
                              ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                              : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
                          )}
                          value={inviteEmail || ""}
                          onChange={(e) => {
                            if (e.target.value.length > 0) {
                              setInviteEmail(e.target.value);
                            } else {
                              setInviteEmail("");
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <div className="flex flex-row">
                        <div className="flex flex-1"></div>
                        <div className="flex">
                          <Button
                            disabled={!inviteEmail || !isEmailValid(inviteEmail)}
                            type="submit"
                            onClick={handleSendInvitation}
                          >
                            Send Invite
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mt-8 space-y-8">
                  <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-5">
                    <div className="sm:col-span-5">
                      <div className="block text-sm font-medium text-gray-800">
                        Members: {invitations.length} pending invitation(s), {members.length} active member(s).
                        {isMembersLoading ? (
                          <span className="ml-2 text-xs text-gray-400">
                            loading...
                          </span>
                        ) : null}
                      </div>


                      <ul className="mt-6 space-y-4">
                        {invitations.map((invitation) => (
                          <li
                            key={invitation.id}
                            className="mt-2 flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <div className="">
                                <div className="text-sm font-medium text-gray-500">
                                  {invitation.inviteEmail}
                                </div>
                                <div className="flex-cols flex text-sm text-gray-500">
                                  <div className="mr-1 mt-0.5 flex h-4 w-4 flex-initial">
                                    <img src="/static/favicon.png"></img>
                                  </div>
                                  <div className="flex flex-1">
                                    [pending]
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-sm text-gray-500">
                              <Button
                                type="submit"
                                onClick={() => handleRevokeInvitation(invitation.id)}
                              >
                              Revoke invitation
                            </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <ul className="mt-6 space-y-4">
                        {members.map((member) => (
                          <li
                            key={member.id}
                            className="mt-2 flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <div className="">
                                <div className="text-sm font-medium text-gray-500">
                                  {member.name}{" "}
                                  {member.id === user?.id ? (
                                    <span className="ml-1 rounded-sm bg-gray-200 px-1 py-0.5 text-xs font-bold text-gray-900">
                                      you
                                    </span>
                                  ) : null}
                                </div>
                                {member.provider === "google" ? (
                                  <div className="flex-cols flex text-sm text-gray-500">
                                    <div className="mr-1 mt-0.5 flex h-4 w-4 flex-initial">
                                      <img src="/static/google_white_32x32.png"></img>
                                    </div>
                                    <div className="flex flex-1">
                                      {member.email}
                                    </div>
                                  </div>
                                ) : null}
                                {member.provider === "github" ? (
                                  <div className="flex-cols flex text-sm text-gray-500">
                                    <div className="mr-1 mt-0.5 flex h-4 w-4 flex-initial">
                                      <img src="/static/github_black_32x32.png"></img>
                                    </div>
                                    <div className="flex flex-1">
                                      {member.username}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="w-28 flex-shrink-0 text-sm text-gray-500">
                              {member.id !== user?.id ? (
                                <Listbox
                                  value={member.workspaces[0].role}
                                  onChange={(role) => {
                                    handleMemberRoleChange(member, role);
                                  }}
                                >
                                  {({ open }) => (
                                    <>
                                      <div className="relative">
                                        <Listbox.Button className="relative w-full cursor-default cursor-pointer rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-sm leading-6 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-1">
                                          <span className="block truncate">
                                            {member.workspaces[0].role ===
                                            "none"
                                              ? "revoked"
                                              : member.workspaces[0].role}
                                          </span>
                                          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                            <ChevronUpDownIcon
                                              className="h-5 w-5 text-gray-400"
                                              aria-hidden="true"
                                            />
                                          </span>
                                        </Listbox.Button>

                                        <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none">
                                          {[
                                            "admin",
                                            "builder",
                                            "user",
                                            "revoked",
                                          ].map((role) => (
                                            <Listbox.Option
                                              key={role}
                                              className={({ active }) =>
                                                classNames(
                                                  active
                                                    ? "cursor-pointer font-semibold"
                                                    : "",
                                                  "text-gray-900",
                                                  "relative cursor-default select-none py-1 pl-3 pr-9"
                                                )
                                              }
                                              value={role}
                                            >
                                              {({ selected, active }) => (
                                                <>
                                                  <span
                                                    className={classNames(
                                                      selected
                                                        ? "font-semibold"
                                                        : "",
                                                      "block truncate"
                                                    )}
                                                  >
                                                    {role}
                                                  </span>

                                                  {selected ? (
                                                    <span
                                                      className={classNames(
                                                        "text-violet-600",
                                                        "absolute inset-y-0 right-0 flex items-center pr-4"
                                                      )}
                                                    >
                                                      <CheckIcon
                                                        className="h-4 w-4"
                                                        aria-hidden="true"
                                                      />
                                                    </span>
                                                  ) : null}
                                                </>
                                              )}
                                            </Listbox.Option>
                                          ))}
                                        </Listbox.Options>
                                      </div>
                                    </>
                                  )}
                                </Listbox>
                              ) : (
                                <span className="ml-2 italic text-gray-900">
                                  admin
                                </span>
                              )}
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
