import { ConfirmContext } from "@app/components/Confirm";
import {
  ROLE_DESCRIPTIONS,
  ROLE_NAMES_IN_SENTENCE,
} from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { BillingPeriodSwitch } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  formatPriceCents,
  getAvailableFrequencies,
  groupSeatTypesByFrequency,
  includedSeatsOpen,
  SeatCard,
  sortSeatTypes,
} from "@app/components/workspace/SeatCard";
import { useChangeMembersRoles } from "@app/hooks/useChangeMembersRoles";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useSearchMembersByEmails } from "@app/hooks/useSearchMembersByEmails";
import type {
  SeatBillingFrequency,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { getPriceAsString } from "@app/lib/client/subscription";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatList } from "@app/lib/i18n/format";
import {
  mutateWorkspaceInvitations,
  sendInvitations,
} from "@app/lib/invitations";
import { useSeatPlan } from "@app/lib/swr/credits";
import { isEmailValid } from "@app/lib/utils";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/types/membership_invitation";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType, toBaseSeatType } from "@app/types/memberships";
import type { SubscriptionPerSeatPricing } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";
import { isRoleType } from "@app/types/user";
import {
  Button,
  Chip,
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
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";

const useGetEmailsListAndError = (
  inviteEmails: string
): { inviteEmailsList: string[] | null; emailError: string } => {
  const { t } = useLingui();
  return useMemo(() => {
    const inviteEmailsList = inviteEmails
      .split(/[\n,]+/)
      .map((e) => e.trim())
      .filter((e) => e !== "")
      .filter((e, i, self) => self.indexOf(e) === i);

    const invalidEmails = inviteEmailsList.filter((e) => !isEmailValid(e));
    if (invalidEmails.length > 0) {
      const invalidEmailsList = formatList(
        invalidEmails,
        { type: "conjunction" },
        getActiveLocale()
      );
      return {
        inviteEmailsList: null,
        emailError: t`Invalid email addresses: ${invalidEmailsList}`,
      };
    }

    return {
      inviteEmailsList,
      emailError: "",
    };
  }, [inviteEmails, t]);
};

function isSeatAtCapacity(
  seatType: MembershipSeatType,
  info: SeatTypeInfo
): boolean {
  if (seatType === "free") {
    return false;
  }
  return info.maxSeats !== null && info.assignedCount >= info.maxSeats;
}

interface SeatBadgeProps {
  seatType: MembershipSeatType;
  info: SeatTypeInfo;
}

function SeatBadge({ seatType, info }: SeatBadgeProps) {
  const { t } = useLingui();
  const openCount = includedSeatsOpen(info);
  if (toBaseSeatType(seatType) !== "workspace" && openCount > 0) {
    return (
      <Chip
        size="xs"
        color="primary"
        label={t`${plural(openCount, {
          one: "# Available",
          other: "# Available",
        })}`}
      />
    );
  }

  if (seatType === "free") {
    return <Chip size="xs" color="primary" label={t`If eligible`} />;
  }

  return (
    <span className="text-xs text-foreground">
      {formatPriceCents(
        info.priceCents,
        info.currency,
        info.billingFrequency,
        t
      )}
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
  const { t } = useLingui();
  const [inviteEmails, setInviteEmails] = useState<string>("");
  const { inviteEmailsList, emailError } =
    useGetEmailsListAndError(inviteEmails);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const confirm = useContext(ConfirmContext);
  const [invitationRole, setInvitationRole] = useState<ActiveRoleType>("user");
  const handleMembersRoleChange = useChangeMembersRoles({ owner });
  const searchMembersByEmails = useSearchMembersByEmails({ owner });

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
        title: t`Too many invitations`,
        description: t`Your cannot send more than ${MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY} invitations per day.`,
      });
      return;
    }

    const foundMembers = await searchMembersByEmails(inviteEmailsList);
    if (!foundMembers) {
      return;
    }
    const existingMembersByEmail = new Map(
      foundMembers.map((m) => [m.email.toLowerCase(), m])
    );
    const existingMembers = [...existingMembersByEmail.values()];

    const invitesByCase = {
      activeSameRole: existingMembers.filter((m) => m.role === invitationRole),
      activeDifferentRole: existingMembers.filter(
        (m) => m.role !== invitationRole && m.role !== "none"
      ),
      notInWorkspace: inviteEmailsList.filter((email) => {
        const member = existingMembersByEmail.get(email.toLowerCase());
        return !member || member.role === "none";
      }),
    };

    const { notInWorkspace, activeDifferentRole } = invitesByCase;
    const activeDifferentRoleCount = activeDifferentRole.length;
    const newRole = t(ROLE_NAMES_IN_SENTENCE[invitationRole]);

    const ReinviteUsersMessage = (
      <div className="mt-6 flex flex-col gap-6 px-2">
        {activeDifferentRole.length > 0 && (
          <div>
            <div>
              <Plural
                value={activeDifferentRoleCount}
                one={
                  <Trans>
                    The user below is already in your workspace with a different
                    role. Moving forward will change their role to{" "}
                    <span className="font-bold">{newRole}</span>.
                  </Trans>
                }
                other={
                  <Trans>
                    The users below are already in your workspace with a
                    different role. Moving forward will change their role to{" "}
                    <span className="font-bold">{newRole}</span>.
                  </Trans>
                }
              />
            </div>
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded border p-2 text-xs">
              {activeDifferentRole.map((user) => {
                const fullName = user.fullName;
                const email = user.email;
                const role = user.role;
                const currentRole = isRoleType(role)
                  ? t(ROLE_NAMES_IN_SENTENCE[role])
                  : role;
                return (
                  <div
                    key={user.email}
                  >{t`- ${fullName} (${email}, current role: ${currentRole})`}</div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Trans>Do you want to proceed?</Trans>
        </div>
      </div>
    );

    const hasExistingMembers = activeDifferentRole.length > 0;

    const shouldProceedWithInvites =
      !hasExistingMembers ||
      (await confirm({
        title: t`Some users are already in the workspace`,
        message: ReinviteUsersMessage,
        validateLabel: t`Yes, proceed`,
        validateVariant: "warning",
      }));

    if (shouldProceedWithInvites) {
      await sendInvitations({
        owner,
        emails: notInWorkspace,
        invitationRole,
        seatType: selectedSeatType,
        sendNotification,
        sendApiErrorNotification,
        isNewInvitation: true,
      });

      if (hasExistingMembers) {
        await handleMembersRoleChange({
          members: activeDifferentRole,
          role: invitationRole,
        });
        await mutate(`/api/w/${owner.sId}/members`);
      }
      await mutateWorkspaceInvitations(owner);
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
          label={t`Invite members`}
          variant="primary"
          onClick={onInviteClick}
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex flex-col gap-1">
            <DialogTitle>
              <Trans>Invite members</Trans>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {hasSeatSelection ? (
                <Trans>Choose a role and a seat for the new members.</Trans>
              ) : (
                <Trans>Choose a role for the new members.</Trans>
              )}
            </p>
          </div>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-6 text-sm">
            <div className="flex flex-col gap-2">
              <label
                className="heading-base text-foreground"
                htmlFor="email-addresses"
              >
                <Trans>Email addresses</Trans>
              </label>
              <TextArea
                id="email-addresses"
                placeholder={t`Email addresses, comma separated`}
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
              <div className="text-muted-foreground">
                {t(ROLE_DESCRIPTIONS[invitationRole])}
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
                        badge={<SeatBadge seatType={seatType} info={info} />}
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
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Invite`,
            variant: "primary",
            disabled: !!shouldDisableButton || isSubmitting,
            isLoading: isSubmitting,
            onClick: async (event: React.MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              if (!inviteEmailsList) {
                return;
              }
              setIsSubmitting(true);
              try {
                await handleSendInvitations(inviteEmailsList);
                setInviteEmails("");
              } finally {
                setIsSubmitting(false);
              }
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
  const { t } = useLingui();
  const price = getPriceAsString({
    currency: perSeatPricing.seatCurrency,
    priceInCents: perSeatPricing.seatPrice,
  });
  return (
    <ContentMessage size="md" title={t`Note`} icon={InfoCircle}>
      <p>
        {perSeatPricing.billingPeriod === "yearly" ? (
          <Trans>
            New users will be charged a{" "}
            <span className="font-semibold">
              yearly fee of {price} at the end of the trial period
            </span>
            .
          </Trans>
        ) : (
          <Trans>
            New users will be charged a{" "}
            <span className="font-semibold">
              monthly fee of {price} at the end of the trial period
            </span>
            .
          </Trans>
        )}
      </p>
      <br />
      <p>
        <Trans>
          Next bill will be adjusted proportionally based on the members'
          sign-up date.
        </Trans>
      </p>
    </ContentMessage>
  );
}
