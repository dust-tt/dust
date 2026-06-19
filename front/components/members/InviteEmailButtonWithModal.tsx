import { ConfirmContext } from "@app/components/Confirm";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { BillingPeriodSwitch } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  formatPriceCents,
  getAvailableFrequencies,
  groupSeatTypesByFrequency,
  SeatCard,
  sortSeatTypes,
} from "@app/components/workspace/SeatCard";
import { useChangeMembersRoles } from "@app/hooks/useChangeMembersRoles";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  SeatBillingFrequency,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { getPriceAsString } from "@app/lib/client/subscription";
import { clientFetch } from "@app/lib/egress/client";
import {
  MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY,
  sendInvitations,
} from "@app/lib/invitations";
import { useSeatPlan } from "@app/lib/swr/credits";
import { isEmailValid } from "@app/lib/utils";
import {
  isMembershipSeatType,
  type MembershipSeatType,
} from "@app/types/memberships";
import type { SubscriptionPerSeatPricing } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  InfoCircle,
  Plus,
  TextArea,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";

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

function includedSeatsOpen(info: SeatTypeInfo): number {
  return Math.max(0, info.minSeats - info.assignedCount);
}

function isSeatAtCapacity(
  seatType: MembershipSeatType,
  info: SeatTypeInfo
): boolean {
  if (seatType === "free") {
    return false;
  }
  return info.maxSeats !== null && info.assignedCount >= info.maxSeats;
}

function seatBadge(
  seatType: MembershipSeatType,
  info: SeatTypeInfo
): ReactNode {
  if (seatType === "free") {
    return (
      <span className="text-xs text-foreground dark:text-foreground-night">
        Free if eligible
      </span>
    );
  }
  const openCount = includedSeatsOpen(info);
  const price = formatPriceCents(
    info.priceCents,
    info.currency,
    info.billingFrequency
  );
  return (
    <span className="text-xs text-foreground dark:text-foreground-night">
      {price} · {openCount} included seat{pluralize(openCount)} open
    </span>
  );
}

interface InviteEmailButtonWithModalProps {
  owner: WorkspaceType;
  prefillText: string;
  perSeatPricing: SubscriptionPerSeatPricing | null;
  onInviteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  isFreePlan?: boolean;
}

export function InviteEmailButtonWithModal({
  owner,
  prefillText,
  perSeatPricing,
  onInviteClick,
  disabled = false,
  isFreePlan = false,
}: InviteEmailButtonWithModalProps) {
  const [inviteEmails, setInviteEmails] = useState<string>("");
  const { inviteEmailsList, emailError } =
    useGetEmailsListAndError(inviteEmails);
  const [open, setOpen] = useState(false);

  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);
  const [invitationRole, setInvitationRole] = useState<ActiveRoleType>("user");
  const handleMembersRoleChange = useChangeMembersRoles({ owner });

  const { seatPlans, isSeatPlanLoading } = useSeatPlan({
    workspaceId: owner.sId,
    disabled: !open,
  });
  const seatTypes = useMemo(() => {
    const all = sortSeatTypes(
      Object.keys(seatPlans).filter(isMembershipSeatType)
    );
    return isFreePlan ? all.filter((s) => s === "free") : all;
  }, [seatPlans, isFreePlan]);
  const seatTypesByFrequency = useMemo(
    () => groupSeatTypesByFrequency(seatTypes, seatPlans),
    [seatTypes, seatPlans]
  );
  const availableFrequencies = getAvailableFrequencies(seatTypesByFrequency);
  const hasSeatSelection = seatTypes.length > 0;
  const [activeFrequency, setActiveFrequency] =
    useState<SeatBillingFrequency>("monthly");
  const [selectedSeatType, setSelectedSeatType] =
    useState<MembershipSeatType | null>(null);
  const seatInitializedRef = useRef(false);

  // Initialize the seat selection once per modal opening
  useEffect(() => {
    if (!open) {
      seatInitializedRef.current = false;
      return;
    }
    if (seatInitializedRef.current || isSeatPlanLoading || !hasSeatSelection) {
      return;
    }
    const notAtCapacity = seatTypes.filter((s) => {
      const info = seatPlans[s];
      return info && !isSeatAtCapacity(s, info);
    });
    const candidates = notAtCapacity.length > 0 ? notAtCapacity : seatTypes;
    const paidCandidates = candidates.filter((s) => s !== "free");
    const cheapestPaid = paidCandidates.reduce<MembershipSeatType | undefined>(
      (min, s) =>
        min === undefined ||
        (seatPlans[s]?.priceCents ?? 0) < (seatPlans[min]?.priceCents ?? 0)
          ? s
          : min,
      undefined
    );
    const defaultSeat =
      candidates.find((s) => s === "free") ??
      cheapestPaid ??
      candidates[0] ??
      null;
    setSelectedSeatType(defaultSeat);
    setActiveFrequency(
      (defaultSeat && seatPlans[defaultSeat]?.billingFrequency) ??
        (availableFrequencies.includes("monthly")
          ? "monthly"
          : (availableFrequencies[0] ?? "monthly"))
    );
    seatInitializedRef.current = true;
  }, [
    open,
    isSeatPlanLoading,
    hasSeatSelection,
    seatTypes,
    seatPlans,
    availableFrequencies,
  ]);

  // Switch billing cadence; keep the selection valid by falling back to the
  // first selectable tier in the new cadence when the current one isn't offered.
  function handleSeatFrequencyChange(period: "monthly" | "yearly") {
    let frequency: SeatBillingFrequency;
    switch (period) {
      case "yearly":
        frequency = "annual";
        break;
      case "monthly":
        frequency = "monthly";
        break;
      default:
        assertNever(period);
    }
    setActiveFrequency(frequency);
    const inFrequency = seatTypesByFrequency[frequency];
    if (!selectedSeatType || !inFrequency.includes(selectedSeatType)) {
      const nextSeat =
        inFrequency.find((s) => {
          const info = seatPlans[s];
          return info && !isSeatAtCapacity(s, info);
        }) ??
        inFrequency[0] ??
        null;
      setSelectedSeatType(nextSeat);
    }
  }

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
        const response = await clientFetch(
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
        seatType: selectedSeatType,
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          icon={Plus}
          label="Invite members"
          variant="primary"
          onClick={onInviteClick}
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex flex-col gap-1">
            <DialogTitle>Invite new users</DialogTitle>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Choose a new plan to continue
            </p>
          </div>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-6 text-sm">
            <div className="flex flex-col gap-2">
              <div className="heading-base text-foreground dark:text-foreground-night">
                Email addresses
              </div>
              <TextArea
                placeholder="Email addresses, comma separated"
                minRows={3}
                value={inviteEmails}
                onChange={(e) => {
                  setInviteEmails(e.target.value);
                }}
                error={emailError}
                showErrorLabel
              />
              <div className="flex items-center gap-2">
                <RoleDropDown
                  selectedRole={invitationRole}
                  onChange={setInvitationRole}
                />
              </div>
              <div className="text-muted-foreground dark:text-muted-foreground-night">
                {ROLES_DATA[invitationRole]["description"]}
              </div>
            </div>
            {hasSeatSelection && (
              <div className="flex flex-col gap-3">
                {availableFrequencies.length > 1 && (
                  <div className="self-start">
                    <BillingPeriodSwitch
                      key={activeFrequency}
                      defaultValue={
                        activeFrequency === "annual" ? "yearly" : "monthly"
                      }
                      onValueChange={handleSeatFrequencyChange}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {seatTypesByFrequency[activeFrequency].map((seatType) => {
                    const info = seatPlans[seatType];
                    if (!info) {
                      return null;
                    }
                    return (
                      <SeatCard
                        key={seatType}
                        seatType={seatType}
                        info={info}
                        isSelected={selectedSeatType === seatType}
                        badge={seatBadge(seatType, info)}
                        onClick={() => setSelectedSeatType(seatType)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {perSeatPricing !== null && (
              <div className="justify-self-end">
                <ProPlanBillingNotice perSeatPricing={perSeatPricing} />
              </div>
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Validate",
            variant: "primary",
            disabled: !!shouldDisableButton,
            onClick: async (event: React.MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              if (!inviteEmailsList) {
                return;
              }
              await handleSendInvitations(inviteEmailsList);
              setInviteEmails("");
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProPlanBillingNotice({
  perSeatPricing,
}: {
  perSeatPricing: SubscriptionPerSeatPricing;
}) {
  return (
    <ContentMessage size="md" title="Note" icon={InfoCircle}>
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
