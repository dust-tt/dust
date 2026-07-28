import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useUpdateUserSpendLimit,
  useUserSpendLimit,
} from "@app/lib/swr/memberships";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import type { SpendLimitOverrideTimeframeType } from "@app/types/credits";
import { isSpendLimitOverrideTimeframeType } from "@app/types/credits";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
  Input,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

const MIN_AWU_CREDITS = 0;
const MAX_AWU_CREDITS = 1_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type SpendLimitKind = "default" | "override";

function isSpendLimitKind(value: string): value is SpendLimitKind {
  return value === "default" || value === "override";
}

// `<input type="date">` values are calendar dates ("YYYY-MM-DD") with no
// timezone; treating them as UTC midnight in both directions keeps the
// round-trip stable regardless of the admin's local timezone.
function epochMsToDateInputValue(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function dateInputValueToEpochMs(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function formatShortDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type ExpiryMode = "never" | "date" | "next_credit_reset";

function isExpiryMode(value: string): value is ExpiryMode {
  return value === "never" || value === "date" || value === "next_credit_reset";
}

interface EditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: WorkspaceType;
  // How many days the linked upgrade request asked for, if the modal was
  // opened to resolve one. Pre-fills the expiry date; the admin can still
  // change it. Null when opened from the members table directly.
  requestedDurationDays?: number | null;
  // sId of the linked upgrade request, if any — forwarded on save so the
  // granted amount/expiry gets recorded on it for the admin history view.
  linkedRequestId?: string | null;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  // Fired once the spend limit has been persisted successfully (not on cancel
  // or a load error). Used to resolve a linked upgrade request as approved.
  onSaved?: () => void;
}

export function EditSpendLimitModal({
  isOpen,
  onClose,
  member,
  owner,
  requestedDurationDays,
  linkedRequestId,
  onSavingChange,
  onSaved,
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

  const [kind, setKind] = useState<SpendLimitKind>("override");
  const [creditsInput, setCreditsInput] = useState<string>("");
  const [timeframe, setTimeframe] =
    useState<SpendLimitOverrideTimeframeType | null>(null);
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("never");
  const [expiresAtInput, setExpiresAtInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) {
      setIsSaving(false);
      setValidationMessage(null);
      return;
    }
    if (!spendLimit) {
      return;
    }
    switch (spendLimit.kind) {
      case "limited":
        setKind("override");
        setCreditsInput(String(spendLimit.awuCredits));
        setTimeframe(spendLimit.timeframe ?? null);
        if (spendLimit.expiresAt) {
          setExpiryMode("date");
          setExpiresAtInput(epochMsToDateInputValue(spendLimit.expiresAt));
        } else {
          setExpiryMode("never");
          setExpiresAtInput("");
        }
        break;
      case "unlimited":
        setKind("default");
        setCreditsInput("");
        setTimeframe(null);
        if (requestedDurationDays) {
          setExpiryMode("date");
          setExpiresAtInput(
            epochMsToDateInputValue(
              Date.now() + requestedDurationDays * ONE_DAY_MS
            )
          );
        } else {
          setExpiryMode("never");
          setExpiresAtInput("");
        }
        break;
      default:
        assertNeverAndIgnore(spendLimit);
    }
    setValidationMessage(null);
  }, [isOpen, spendLimit, requestedDurationDays]);

  function handleSelectKind(next: SpendLimitKind) {
    setKind(next);
    setValidationMessage(null);
  }

  function handleCreditsChange(value: string) {
    // Keep only digits — credits are integers and the API range starts at 0.
    const cleaned = value.replace(/[^\d]/g, "");
    setCreditsInput(cleaned);
    setValidationMessage(null);
  }

  function validate(): { ok: true; awuCredits: number } | { ok: false } {
    switch (kind) {
      case "default":
        return { ok: true, awuCredits: 0 };
      case "override": {
        const parsed = Number(creditsInput);
        if (!Number.isInteger(parsed) || parsed < MIN_AWU_CREDITS) {
          setValidationMessage(
            `Enter a whole number of credits between ${MIN_AWU_CREDITS.toLocaleString("en-US")} and ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`
          );
          return { ok: false };
        }
        if (parsed > MAX_AWU_CREDITS) {
          setValidationMessage(
            `Credits cannot exceed ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`
          );
          return { ok: false };
        }
        return { ok: true, awuCredits: parsed };
      }
      default:
        assertNeverAndIgnore(kind);
        return { ok: false };
    }
  }

  async function handleValidate() {
    const result = validate();
    if (!result.ok) {
      return;
    }

    if (!displayedMember) {
      return;
    }

    setIsSaving(true);
    onSavingChange?.(displayedMember.sId, true);
    try {
      let limit: UserSpendLimit;
      switch (kind) {
        case "default":
          limit = { kind: "unlimited" };
          break;
        case "override": {
          let expiresAt: number | null;
          switch (expiryMode) {
            case "never":
              expiresAt = null;
              break;
            case "date":
              expiresAt = dateInputValueToEpochMs(expiresAtInput);
              break;
            case "next_credit_reset":
              expiresAt = spendLimit?.nextCreditResetAt ?? null;
              break;
            default:
              assertNeverAndIgnore(expiryMode);
              expiresAt = null;
          }
          limit = {
            kind: "limited",
            awuCredits: result.awuCredits,
            timeframe,
            expiresAt,
          };
          break;
        }
        default:
          assertNeverAndIgnore(kind);
          return;
      }
      const body = await doUpdateSpendLimit({
        memberId: displayedMember.sId,
        memberName: displayedMember.name,
        limit,
        requestId: linkedRequestId,
      });
      if (body) {
        onSaved?.();
        onClose();
      }
    } finally {
      setIsSaving(false);
      onSavingChange?.(displayedMember.sId, false);
    }
  }

  const validateDisabled =
    isSaving ||
    isSpendLimitLoading ||
    (kind === "override" && creditsInput.length === 0);
  const primaryDisabled = isSpendLimitError
    ? isSaving || isSpendLimitLoading
    : validateDisabled;

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
                Maximum pool credits this member can consume, on top of the
                seat&apos;s built-in allowance. Optionally enforced over a
                shorter rolling window than the billing cycle.
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
                value="override"
                id="spend-limit-override"
                label="Use custom monthly limit"
              />

              {kind === "override" && (
                <div className="flex flex-col gap-1.5 pl-6">
                  <div className="relative">
                    <Input
                      id="spend-credit-limit-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="1,000"
                      value={
                        creditsInput !== ""
                          ? Number(creditsInput).toLocaleString()
                          : ""
                      }
                      onChange={(e) => handleCreditsChange(e.target.value)}
                      isError={validationMessage !== null}
                      message={validationMessage ?? undefined}
                      messageStatus={
                        validationMessage !== null ? "error" : undefined
                      }
                      className="pr-28 text-right"
                    />
                    <span className="copy-sm pointer-events-none absolute right-3 top-0 flex h-9 items-center text-muted-foreground">
                      credits
                    </span>
                  </div>
                  <RadioGroup
                    value={timeframe ?? "billing_cycle"}
                    onValueChange={(v) =>
                      setTimeframe(
                        isSpendLimitOverrideTimeframeType(v) ? v : null
                      )
                    }
                    className="flex flex-row gap-4 pt-1"
                  >
                    <RadioGroupItem
                      value="billing_cycle"
                      id="spend-limit-timeframe-billing-cycle"
                      label="Per billing cycle"
                    />
                    <RadioGroupItem
                      value="day"
                      id="spend-limit-timeframe-day"
                      label="Per day"
                    />
                    <RadioGroupItem
                      value="week"
                      id="spend-limit-timeframe-week"
                      label="Per week"
                    />
                    <RadioGroupItem
                      value="month"
                      id="spend-limit-timeframe-month"
                      label="Per rolling month"
                    />
                  </RadioGroup>
                  <div className="flex flex-col gap-1.5 pt-2">
                    <span className="text-sm font-medium">Expires</span>
                    <RadioGroup
                      value={expiryMode}
                      onValueChange={(v) => {
                        if (isExpiryMode(v)) {
                          setExpiryMode(v);
                        }
                      }}
                      className="flex flex-col gap-2"
                    >
                      <RadioGroupItem
                        value="never"
                        id="spend-limit-expiry-never"
                        label="Never"
                      />
                      <RadioGroupItem
                        value="date"
                        id="spend-limit-expiry-date"
                        label="On a specific date"
                      />
                      {spendLimit?.nextCreditResetAt && (
                        <RadioGroupItem
                          value="next_credit_reset"
                          id="spend-limit-expiry-next-credit-reset"
                          label={`At next credit refresh (${formatShortDate(spendLimit.nextCreditResetAt)})`}
                        />
                      )}
                    </RadioGroup>
                    {expiryMode === "date" && (
                      <Input
                        id="spend-limit-expires-at"
                        type="date"
                        value={expiresAtInput}
                        onChange={(e) => setExpiresAtInput(e.target.value)}
                        className="mt-1"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      On this date, the limit automatically reverts to the
                      workspace default. "Never" is a permanent override.
                    </p>
                  </div>
                </div>
              )}
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
              : handleValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
