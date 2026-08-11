import type { SpendLimitOverrideFormValues } from "@app/components/workspace/SpendLimitOverrideFields";
import {
  SpendLimitOverrideFields,
  spendLimitOverrideFormSchema,
} from "@app/components/workspace/SpendLimitOverrideFields";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useUpdateUserSpendLimit,
  useUserSpendLimit,
} from "@app/lib/swr/memberships";
import { useResolveUpgradeRequest } from "@app/lib/swr/upgrade_requests";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Avatar,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type SpendLimitKind = "default" | "unlimited" | "override";

function isSpendLimitKind(value: string): value is SpendLimitKind {
  return value === "default" || value === "unlimited" || value === "override";
}

interface EditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: WorkspaceType;
  // When set, the modal skips the "workspace default vs. custom limit"
  // choice and opens straight into the custom-limit form.
  forceOverride?: boolean;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  // When set, the modal is resolving this pending upgrade request: the limit
  // is submitted together with the approval in a single call instead of a
  // separate spend-limit update, so the two can't drift apart if one half
  // fails.
  upgradeRequestId?: string | null;
}

export function EditSpendLimitModal({
  isOpen,
  onClose,
  member,
  owner,
  forceOverride = false,
  onSavingChange,
  upgradeRequestId = null,
}: EditSpendLimitModalProps) {
  // Keep the last non-null member so the dialog can render its content through
  // the exit animation after the parent has cleared `member`.
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  if (member) {
    lastMemberRef.current = member;
  }
  const displayedMember = member ?? lastMemberRef.current;

  const {
    spendLimit,
    isSpendLimitLoading,
    isSpendLimitError,
    mutateSpendLimit,
  } = useUserSpendLimit({
    workspaceId: owner.sId,
    memberId: displayedMember?.sId ?? "",
    disabled: !isOpen || !displayedMember,
  });
  const { doUpdateSpendLimit } = useUpdateUserSpendLimit({
    workspaceId: owner.sId,
  });
  const { doResolveUpgradeRequest } = useResolveUpgradeRequest({
    workspaceId: owner.sId,
  });

  const [kind, setKind] = useState<SpendLimitKind>("override");
  const [isSaving, setIsSaving] = useState(false);

  const overrideForm = useForm<SpendLimitOverrideFormValues>({
    resolver: zodResolver(spendLimitOverrideFormSchema),
    defaultValues: { creditsInput: "", expiryMode: "never" },
  });

  // The amount currently persisted
  const currentAwuCredits =
    spendLimit?.kind === "limited" ? spendLimit.awuCredits : null;

  useEffect(() => {
    if (!isOpen) {
      setIsSaving(false);
      return;
    }
    if (!spendLimit) {
      return;
    }
    switch (spendLimit.kind) {
      case "limited":
        setKind("override");
        overrideForm.reset({
          creditsInput: String(spendLimit.awuCredits),
          expiryMode:
            spendLimit.expiresAt === null
              ? "never"
              : spendLimit.expiresAt === spendLimit.nextCreditResetAt
                ? "next_credit_reset"
                : "one_day",
        });
        break;
      case "unlimited":
        setKind(forceOverride ? "override" : "unlimited");
        overrideForm.reset({ creditsInput: "", expiryMode: "never" });
        break;
      case "default":
        setKind(forceOverride ? "override" : "default");
        overrideForm.reset({ creditsInput: "", expiryMode: "never" });
        break;
      default:
        assertNeverAndIgnore(spendLimit);
    }
  }, [isOpen, spendLimit, forceOverride, overrideForm]);

  function handleSelectKind(next: SpendLimitKind) {
    setKind(next);
  }

  async function submitLimit(limit: UserSpendLimit) {
    if (!displayedMember) {
      return;
    }

    setIsSaving(true);
    onSavingChange?.(displayedMember.sId, true);
    try {
      const saved = upgradeRequestId
        ? await doResolveUpgradeRequest({
            requestId: upgradeRequestId,
            resolution: { status: "approved", limit },
          })
        : !!(await doUpdateSpendLimit({
            memberId: displayedMember.sId,
            memberName: displayedMember.name,
            limit,
          }));
      if (saved) {
        onClose();
      }
    } finally {
      setIsSaving(false);
      onSavingChange?.(displayedMember.sId, false);
    }
  }

  async function handleValidate() {
    if (!displayedMember) {
      return;
    }

    switch (kind) {
      case "default":
        await submitLimit({ kind: "default" });
        return;
      case "unlimited":
        await submitLimit({ kind: "unlimited" });
        return;
      case "override":
        await overrideForm.handleSubmit(async (data) => {
          let expiresAt: number | null;
          switch (data.expiryMode) {
            case "never":
              expiresAt = null;
              break;
            case "one_day":
              expiresAt = Date.now() + ONE_DAY_MS;
              break;
            case "next_credit_reset":
              expiresAt = spendLimit?.nextCreditResetAt ?? null;
              break;
            default:
              assertNever(data.expiryMode);
          }
          await submitLimit({
            kind: "limited",
            awuCredits: Number(data.creditsInput),
            expiresAt,
          });
        })();
        return;
      default:
        assertNever(kind);
    }
  }

  const watchedCreditsInput = overrideForm.watch("creditsInput");
  const validateDisabled =
    isSaving ||
    isSpendLimitLoading ||
    (kind === "override" && watchedCreditsInput.length === 0);
  const primaryDisabled = isSpendLimitError
    ? isSaving || isSpendLimitLoading
    : validateDisabled;

  const overrideFields = (
    <SpendLimitOverrideFields
      control={overrideForm.control}
      member={displayedMember}
      currentAwuCredits={currentAwuCredits}
      nextCreditResetAt={spendLimit?.nextCreditResetAt ?? null}
    />
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar
              visual={displayedMember?.image ?? undefined}
              name={displayedMember?.name}
              size="md"
              isRounded
            />
            <div>
              <DialogTitle>
                Edit spend limit for {displayedMember?.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Maximum pool credits this member can consume during a billing
                cycle. This limit is added on top of the seat&apos;s built-in
                allowance.
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          {isSpendLimitError ? (
            <ContentMessage
              title="Failed to load spend limit"
              icon={AlertCircle}
              variant="warning"
            >
              <p>
                We couldn’t load the current spend limit. Please retry before
                making changes.
              </p>
            </ContentMessage>
          ) : isSpendLimitLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : forceOverride ? (
            overrideFields
          ) : (
            <RadioGroup
              value={kind}
              onValueChange={(v) => {
                if (isSpendLimitKind(v)) {
                  handleSelectKind(v);
                }
              }}
              className="flex flex-col gap-3"
            >
              <RadioGroupItem
                value="default"
                id="spend-limit-default"
                label="Use workspace default"
              />
              <RadioGroupItem
                value="unlimited"
                id="spend-limit-unlimited"
                label="Allow unlimited spend"
              />
              <RadioGroupItem
                value="override"
                id="spend-limit-override"
                label="Use custom monthly limit"
              />

              {kind === "override" && overrideFields}
            </RadioGroup>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: isSpendLimitError ? "Retry" : "Validate",
            variant: "primary",
            disabled: primaryDisabled,
            onClick: isSpendLimitError
              ? () => void mutateSpendLimit()
              : () => void handleValidate(),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
