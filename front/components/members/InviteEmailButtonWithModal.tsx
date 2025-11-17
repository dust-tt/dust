import {
  Button,
  ContentMessage,
  InformationCircleIcon,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  TextArea,
} from "@dust-tt/sparkle";
import { useContext, useEffect, useMemo, useState } from "react";
import { mutate } from "swr";

import { ConfirmContext } from "@app/components/Confirm";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { useChangeMembersRoles } from "@app/hooks/useChangeMembersRoles";
import { useSendNotification } from "@app/hooks/useNotification";
import { getPriceAsString } from "@app/lib/client/subscription";
import {
  MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY,
  sendInvitations,
} from "@app/lib/invitations";
import { isEmailValid } from "@app/lib/utils";
import type {
  ActiveRoleType,
  SubscriptionPerSeatPricing,
  WorkspaceType,
} from "@app/types";

const useGetEmailsListAndError = (
  inviteEmails: string
): { inviteEmailsList: string[] | null; emailError: string } => {
  return useMemo(() => {
    const inviteEmailsList = inviteEmails
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter((e) => e !== "")
      .filter((e, i, self) => self.indexOf(e) === i);

    const invalidEmails = inviteEmailsList.filter((e) => !isEmailValid(e));
    if (invalidEmails.length > 0) {
      return {
        inviteEmailsList: null,
        emailError: "Invalid email addresses: " + invalidEmails.join(", "),
      };
    }

    return {
      inviteEmailsList,
      emailError: "",
    };
  }, [inviteEmails]);
};

export function InviteEmailButtonWithModal({
  owner,
  prefillText,
  perSeatPricing,
  onInviteClick,
}: {
  owner: WorkspaceType;
  prefillText: string;
  perSeatPricing: SubscriptionPerSeatPricing | null;
  onInviteClick: (event: MouseEvent) => void;
}) {
  const [inviteEmails, setInviteEmails] = useState<string>("");
  const { inviteEmailsList, emailError } =
    useGetEmailsListAndError(inviteEmails);
  const [open, setOpen] = useState(false);

  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);
  const [invitationRole, setInvitationRole] = useState<ActiveRoleType>("user");
  const handleMembersRoleChange = useChangeMembersRoles({ owner });

  async function handleSendInvitations(
    inviteEmailsList: string[]
  ): Promise<void> {
    if (
      inviteEmailsList.length > MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY
    ) {
      sendNotification({
        type: "error",
        title: "Too many invitations",
        description: `Your cannot send more than ${MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY} invitations per day.`,
      });
      return;
    }

    const existingMembersResponses = await Promise.all(
      inviteEmailsList.map(async (email) => {
        const response = await fetch(
          `/api/w/${owner.sId}/members/search?searchTerm=${encodeURIComponent(email)}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch member information");
        }
        return response.json();
      })
    );
    const existingMembers = existingMembersResponses.flatMap(
      (response) => response.members
    );

    const invitesByCase = {
      activeSameRole: existingMembers.filter(
        (m) => m && m.workspaces?.role === invitationRole
      ),
      activeDifferentRole: existingMembers.filter(
        (m) =>
          m &&
          m.workspaces?.role !== invitationRole &&
          m.workspaces?.role !== "none"
      ),
      notInWorkspace: inviteEmailsList.filter(
        (m) =>
          !existingMembers.find((x) => x.email === m) ||
          existingMembers.find((x) => x.email === m)?.workspaces?.role ===
            "none"
      ),
    };

    const { notInWorkspace, activeDifferentRole } = invitesByCase;

    const ReinviteUsersMessage = (
      <div className="mt-6 flex flex-col gap-6 px-2">
        {activeDifferentRole.length > 0 && (
          <div>
            <div>
              The user(s) below are already in your workspace with a different
              role. Moving forward will change their role to{" "}
              <span className="font-bold">{displayRole(invitationRole)}</span>.
            </div>
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded border p-2 text-xs">
              {activeDifferentRole.map((user) => (
                <div key={user.email}>{`- ${
                  user.fullName
                } (current role: ${displayRole(user.workspace.role)})`}</div>
              ))}
            </div>
          </div>
        )}

        <div>Do you want to proceed?</div>
      </div>
    );

    const hasExistingMembers = activeDifferentRole.length > 0;

    const shouldProceedWithInvites =
      !hasExistingMembers ||
      (await confirm({
        title: "Some users are already in the workspace",
        message: ReinviteUsersMessage,
        validateLabel: "Yes, proceed",
        validateVariant: "warning",
      }));

    if (shouldProceedWithInvites) {
      await sendInvitations({
        owner,
        emails: notInWorkspace,
        invitationRole,
        sendNotification,
        isNewInvitation: true,
      });

      if (hasExistingMembers) {
        await handleMembersRoleChange({
          members: activeDifferentRole,
          role: invitationRole,
        });
        await mutate(`/api/w/${owner.sId}/members`);
      }
      await mutate(`/api/w/${owner.sId}/invitations`);
      setOpen(false);
    }
  }

  useEffect(() => {
    if (open && prefillText && isEmailValid(prefillText)) {
      setInviteEmails((prev) => {
        if (prev.includes(prefillText)) {
          return prev;
        }
        return prev ? prev + ", " + prefillText : prefillText;
      });
    }
  }, [prefillText, open]);

  const shouldDisableButton = useMemo(() => {
    return !inviteEmailsList || inviteEmailsList.length === 0 || emailError;
  }, [inviteEmailsList, emailError]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          icon={PlusIcon}
          label="Invite members"
          variant="primary"
          onClick={onInviteClick}
        />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Invite new users</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex grow flex-col gap-6 text-sm">
            <div className="flex flex-grow flex-col gap-2">
              <div className="heading-base">
                Email addresses (comma or newline separated):
              </div>
              <TextArea
                placeholder="Email addresses, comma or newline separated"
                value={inviteEmails}
                onChange={(e) => {
                  setInviteEmails(e.target.value);
                }}
                error={emailError}
                showErrorLabel
              />
              <div className="flex items-center gap-2">
                <div className="heading-base text-foreground dark:text-foreground-night">
                  Role:
                </div>
                <RoleDropDown
                  selectedRole={invitationRole}
                  onChange={setInvitationRole}
                />
              </div>
              <div className="text-muted-foreground dark:text-muted-foreground-night">
                {ROLES_DATA[invitationRole]["description"]}
              </div>
            </div>
            {perSeatPricing !== null && (
              <div className="justify-self-end">
                <ProPlanBillingNotice perSeatPricing={perSeatPricing} />
              </div>
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Send Invite",
            disabled: shouldDisableButton,
            onClick: async (event: MouseEvent) => {
              event.preventDefault();
              if (!inviteEmailsList) {
                return;
              }
              await handleSendInvitations(inviteEmailsList);
              setInviteEmails("");
            },
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProPlanBillingNotice({
  perSeatPricing,
}: {
  perSeatPricing: SubscriptionPerSeatPricing;
}) {
  return (
    <ContentMessage size="md" title="Note" icon={InformationCircleIcon}>
      <p>
        New users will be charged a{" "}
        <span className="font-semibold">
          {perSeatPricing.billingPeriod} fee of{" "}
          {getPriceAsString({
            currency: perSeatPricing.seatCurrency,
            priceInCents: perSeatPricing.seatPrice,
          })}{" "}
          at the end of the trial period
        </span>
        .{" "}
      </p>
      <br />
      <p>
        Next bill will be adjusted proportionally based on the members' sign-up
        date.
      </p>
    </ContentMessage>
  );
}
