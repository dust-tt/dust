import {
  Avatar,
  Button,
  ChevronRightIcon,
  ChevronUpDownIcon,
  Chip,
  ClipboardIcon,
  Cog6ToothIcon,
  DropdownMenu,
  Input,
  Modal,
  Page,
  PlusIcon,
  QuestionMarkCircleIcon,
  QuestionMarkCircleStrokeIcon,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import { Listbox } from "@headlessui/react";
import { UsersIcon } from "@heroicons/react/20/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useCallback, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import {
  Authenticator,
  RoleType,
  getSession,
  getUserFromSession,
} from "@app/lib/auth";
import { useMembers, useWorkspaceInvitations } from "@app/lib/swr";
import { classNames, isEmailValid } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";
import { MembershipInvitationType } from "@app/types/membership_invitation";

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
      url: URL,
    },
  };
};

export default function WorkspaceAdmin({
  user,
  owner,
  gaTrackingId,
  url,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { mutate } = useSWRConfig();

  const [disabled, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [allowedDomain, setAllowedDomain] = useState(owner.allowedDomain);
  const [allowedDomainError, setAllowedDomainError] = useState("");

  const inviteLink =
    owner.allowedDomain !== null ? `${url}/w/${owner.sId}/join` : null;

  const [inviteEmail, setInviteEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { members, isMembersLoading } = useMembers(owner);
  const { invitations, isInvitationsLoading } = useWorkspaceInvitations(owner);

  const formValidation = useCallback(() => {
    let valid = true;
    if (allowedDomain === null) {
      setAllowedDomainError("");
    } else {
      // eslint-disable-next-line no-useless-escape
      if (!allowedDomain.match(/^[a-z0-9\.\-]+$/)) {
        setAllowedDomainError("Allowed domain must be a valid domain name.");
        valid = false;
      } else {
        setAllowedDomainError("");
      }
    }

    return valid;
  }, [allowedDomain]);

  useEffect(() => {
    setDisabled(!formValidation());
  }, [allowedDomain, formValidation]);

  const handleUpdateWorkspace = async () => {
    setUpdating(true);
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowedDomain: allowedDomain,
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

  const handleSendInvitation = async () => {
    setIsSending(true);
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
      await mutate(`/api/w/${owner.sId}/invitations`);
    }
    setIsSending(false);
    setInviteEmail("");
  };

  const handleRevokeInvitation = async (invitationId: number) => {
    const res = await fetch(`/api/w/${owner.sId}/invitations/${invitationId}`, {
      method: "POST",
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
      await mutate(`/api/w/${owner.sId}/invitations`);
    }
  };
  const [inviteSettingsOpen, setInviteSettingsOpen] = useState(false);

  function InviteSettings() {
    return (
      <Modal
        isOpen={inviteSettingsOpen}
        onClose={() => {
          setInviteSettingsOpen(false);
          setAllowedDomain(owner.allowedDomain);
        }}
        hasChanged={
          allowedDomain !== owner.allowedDomain && !allowedDomainError
        }
        title="Invitation link settings"
        isFullScreen={false}
        onSave={handleUpdateWorkspace}
      >
        <div className="mt-4 flex flex-col gap-6">
          <div>
            Any person with a Google Workspace email on corresponding domain
            name will be allowed to join the workspace.
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-bold">Whitelisted email domain</div>
            <Input
              className="text-sm"
              placeholder={"Company domain"}
              value={allowedDomain || ""}
              name={""}
              error={allowedDomainError}
              showErrorLabel={true}
              onChange={setAllowedDomain}
            />
          </div>
        </div>
      </Modal>
    );
  }

  const fakeMembers: UserType[] = [
    {
      name: "John Doe",
      email: "john@doe.com",
      workspaces: [{ role: "admin" }],
      image: null,
    },
    {
      name: "Jane Doe",
      email: "jane@doe.fr",
      workspaces: [{ role: "builder" }],
      image: null,
    },
    {
      name: "Coucou Mec",
      email: "coucou@mec.com",
      workspaces: [{ role: "user" }],
      image: null,
    },
    {
      name: "Pas la",
      email: "pas@la.com",
      workspaces: [{ role: "none" }],
      image: null,
    },
  ].map((m) => ({ ...members[0], ...m }));
  const fakeInvitations: MembershipInvitationType[] = [
    {
      inviteEmail: "test@toto.com",
      status: "pending",
      id: 0,
    },
    {
      inviteEmail: "dasfdsafdsafds@dafdasdfas.com",
      status: "consumed",
      id: 1,
    },
    {
      inviteEmail: "thelast@lastone.com",
      status: "revoked",
      id: 2,
    },
  ];

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "members" })}
    >
      <Page>
        <div className="flex flex-col gap-6">
          <Page.Header
            title="Member Management"
            icon={UsersIcon}
            description="Invite and remove members, manage their rights."
          />
          <div>
            <Page.SectionHeader
              title="Invitation Link"
              description="Allow any person with the right email domain name (@company.com) to signup and join your workspace."
            />
            {inviteLink ? (
              <div className="pt-1 text-element-700">
                <Page.P>
                  Invitation link is activated for domain{" "}
                  <span className="font-bold">{`@${allowedDomain}`}</span>
                </Page.P>
                <div className="mt-3 flex justify-between gap-2">
                  <div className="flex-grow">
                    <Input
                      className="text-sm"
                      disabled
                      placeholder={""}
                      value={inviteLink}
                      name={""}
                    />
                  </div>
                  <div className="flex-none">
                    <Button
                      variant="secondary"
                      label="Copy"
                      size="sm"
                      icon={ClipboardIcon}
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink);
                      }}
                    />
                  </div>
                  <div className="flex-none">
                    <Button
                      variant="secondary"
                      label="Settings"
                      size="sm"
                      icon={Cog6ToothIcon}
                      onClick={() => setInviteSettingsOpen(true)}
                    />
                    <InviteSettings />
                  </div>
                </div>
              </div>
            ) : (
              <div></div>
            )}
          </div>
          <MemberList members={fakeMembers} invitations={fakeInvitations} />
        </div>

        {/********************** LEGACY **************/}
        <Page.SectionHeader
          title="Members LEGACY"
          description="Manage active members and invitations to your workspace."
        />
        <div className="mt-6 space-y-4 pb-8">
          <div className="grid grid-cols-1 grid-cols-6 gap-x-4">
            <div className="col-span-6">
              <label
                htmlFor="appName"
                className="block text-sm font-medium text-gray-700"
              >
                Invite by e-mail
              </label>
            </div>
            <div className="col-span-4">
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  name="inviteEmail"
                  id="inviteEmail"
                  className={classNames(
                    "block w-full min-w-0 flex-1 rounded-md text-sm",
                    allowedDomainError
                      ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-action-500 focus:ring-action-500"
                  )}
                  value={inviteEmail || ""}
                  onChange={(e) => {
                    if (e.target.value.length > 0) {
                      setInviteEmail(e.target.value.trim());
                    } else {
                      setInviteEmail("");
                    }
                  }}
                />
              </div>
            </div>
            <div className="col-span-2">
              <div className="mt-1 flex flex-row">
                <div className="flex flex-1"></div>
                <div className="mt-0.5 flex">
                  <Button
                    variant="secondary"
                    disabled={
                      !inviteEmail || !isEmailValid(inviteEmail) || isSending
                    }
                    onClick={handleSendInvitation}
                    label={isSending ? "Sending" : "Send"}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-5">
            <div className="sm:col-span-5">
              <div className="block text-sm font-medium text-gray-800">
                {invitations.length} Invitation
                {invitations.length !== 1 && "s"} and {members.length} Member
                {members.length !== 1 && "s"}:
                {isMembersLoading || isInvitationsLoading ? (
                  <span className="ml-2 text-xs text-gray-400">loading...</span>
                ) : null}
              </div>
              <ul className="ml-2 mt-4 space-y-2">
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
                        <div className="flex-cols flex text-sm italic text-gray-400">
                          pending
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-sm text-gray-500">
                      <Button
                        variant="tertiary"
                        onClick={() => handleRevokeInvitation(invitation.id)}
                        label="Revoke"
                        size="xs"
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <ul className="ml-2 mt-6 space-y-2">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="mt-2 flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <div className="">
                        <div className="text-sm font-medium text-gray-700">
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
                            <div className="flex flex-1">{member.email}</div>
                          </div>
                        ) : null}
                        {member.provider === "github" ? (
                          <div className="flex-cols flex text-sm text-gray-500">
                            <div className="mr-1 mt-0.5 flex h-4 w-4 flex-initial">
                              <img src="/static/github_black_32x32.png"></img>
                            </div>
                            <div className="flex flex-1">{member.username}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="w-28 flex-shrink-0 text-sm text-gray-500">
                      {member.id !== user?.id && (
                        <Listbox
                          value={member.workspaces[0].role}
                          onChange={async (role) => {
                            // await handleMemberRoleChange(member, role);
                          }}
                        >
                          {() => (
                            <>
                              <div className="relative">
                                <Listbox.Button className="relative w-full cursor-default cursor-pointer rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-sm leading-6 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-1">
                                  <span className="block truncate">
                                    {member.workspaces[0].role === "none"
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
                                  {["admin", "builder", "user", "revoked"].map(
                                    (role) => (
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
                                        {({ selected }) => (
                                          <>
                                            <span
                                              className={classNames(
                                                selected ? "font-semibold" : "",
                                                "block truncate"
                                              )}
                                            >
                                              {role}
                                            </span>

                                            {selected ? (
                                              <span
                                                className={classNames(
                                                  "text-action-600",
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
                                    )
                                  )}
                                </Listbox.Options>
                              </div>
                            </>
                          )}
                        </Listbox>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Page>
    </AppLayout>
  );
  function MemberList({
    members,
    invitations,
  }: {
    members: UserType[];
    invitations: MembershipInvitationType[];
  }) {
    function isInvitation(
      arg: MembershipInvitationType | UserType
    ): arg is MembershipInvitationType {
      return (arg as MembershipInvitationType).inviteEmail !== undefined;
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
        await mutate(`/api/w/${owner.sId}/members`);
      }
    };

    const COLOR_FOR_ROLE: { [key: string]: "warning" | "amber" | "emerald" } = {
      admin: "warning",
      builder: "amber",
      user: "emerald",
    };
    const [modalInviteEmailOpen, setModalInviteEmailOpen] = useState(false);
    const [changeRoleMember, setChangeRoleMember] = useState<UserType | null>(
      null
    );
    const [searchText, setSearchText] = useState("");
    const displayList = [
      ...members
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((m) => m.workspaces[0].role !== "none")
        .filter(
          (m) =>
            !searchText ||
            m.name.toLowerCase().includes(searchText) ||
            m.email?.toLowerCase().includes(searchText) ||
            m.username?.toLowerCase().includes(searchText)
        ),
      ...invitations
        .sort((a, b) => a.inviteEmail.localeCompare(b.inviteEmail))
        .filter((i) => i.status === "pending")
        .filter(
          (i) => !searchText || i.inviteEmail.toLowerCase().includes(searchText)
        ),
    ];
    return (
      <>
        <Modal
          isOpen={modalInviteEmailOpen}
          onClose={() => setModalInviteEmailOpen(false)}
          hasChanged={false}
          title="Invite by email"
        >
          Hi
        </Modal>
        <Modal
          isOpen={changeRoleMember !== null}
          onClose={() => setChangeRoleMember(null)}
          hasChanged={false}
          title={changeRoleMember?.name || "Unreachable"}
        >
          <ChangeMemberModal
            member={changeRoleMember}
            handleMemberRoleChange={handleMemberRoleChange}
          />
        </Modal>
        <Page.SectionHeader title="Member list" />
        <div className="flex w-full items-stretch gap-2">
          <div className="flex-grow">
            <Searchbar
              placeholder="Search members"
              onChange={setSearchText}
              value={searchText}
              name={""}
            />
          </div>
          <Button
            variant="primary"
            label="Invite members"
            size="sm"
            icon={PlusIcon}
            onClick={() => setModalInviteEmailOpen(true)}
          />
        </div>
        <div>
          {displayList.map((elt, i) => (
            <div
              key={i}
              className="flex cursor-pointer items-center justify-center gap-3 border-t border-structure-200 py-2 text-sm hover:bg-structure-100"
              onClick={() => {
                if (isInvitation(elt)) return;
                setChangeRoleMember(elt);
              }}
            >
              <div>
                {isInvitation(elt) ? (
                  <QuestionMarkCircleStrokeIcon className="h-7 w-7" />
                ) : (
                  <Avatar visual={elt.image} name={elt.name} size="xs" />
                )}
              </div>
              {!isInvitation(elt) && (
                <div className="font-medium text-element-900">{elt.name}</div>
              )}
              <div className="grow font-normal text-element-700">
                {isInvitation(elt)
                  ? elt.inviteEmail
                  : elt.email || elt.username}
              </div>
              <div>
                {isInvitation(elt) ? (
                  <Chip size="xs" color="slate">
                    <span className="capitalize">{elt.status}</span>
                  </Chip>
                ) : (
                  <Chip
                    size="xs"
                    color={COLOR_FOR_ROLE[elt.workspaces[0].role]}
                    className={
                      /** Force tailwind to include classes we will need below */
                      "text-amber-900 text-emerald-900 text-warning-900"
                    }
                  >
                    <span
                      className={classNames(
                        "capitalize",
                        `text-${COLOR_FOR_ROLE[elt.workspaces[0].role]}-900`
                      )}
                    >
                      {elt.workspaces[0].role}
                    </span>
                  </Chip>
                )}
              </div>
              <div>
                <ChevronRightIcon />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }
}

function ChangeMemberModal({
  member,
  handleMemberRoleChange,
}: {
  member: UserType | null;
  handleMemberRoleChange: (member: UserType, role: RoleType) => void;
}) {
  if (!member) return null; // Unreachable
  const roleTexts: { [k: string]: string } = {
    admin: "Admins can manage members, in addition to builders' rights.",
    builder:
      "Builders can create custom assistants and use advanced dev tools.",
    user: "Users can use assistants provided by Dust as well as custom assistants created by their company.",
  };
  return (
    <div className="mt-6 flex flex-col gap-9 text-sm text-element-700">
      <div className="flex items-center gap-4">
        <Avatar size="lg" visual={member.image} name={member.name} />
        <div className="flex grow flex-col">
          <div className="font-semibold text-element-900">{member.name}</div>
          <div className="font-normal">{member.email}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="font-bold text-element-900">Role:</div>
          <DropdownMenu>
            <DropdownMenu.Button type="select">
              <Button
                variant="secondary"
                label={member.workspaces[0].role}
                size="sm"
                type="select"
                className="capitalize"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items>
              {["admin", "builder", "user"].map((role) => (
                <DropdownMenu.Item
                  key={role}
                  onClick={() =>
                    handleMemberRoleChange(member, role as RoleType)
                  } // TODO
                  label={role}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
        <Page.P>
          The role defines the rights of a member of the workspace.{" "}
          {roleTexts[member.workspaces[0].role]}
        </Page.P>
      </div>
      <div className="flex flex-none flex-col gap-2">
        <div className="flex-none">
          <Button
            variant="primaryWarning"
            label="Revoke member access"
            size="sm"
            onClick={() => handleMemberRoleChange(member, "none")}
          />
        </div>
        <Page.P>
          Deleting a member will remove them from the workspace. They will be
          able to rejoin if they have an invitation link.
        </Page.P>
      </div>
    </div>
  );
}
