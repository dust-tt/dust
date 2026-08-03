import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useUpdateUserSpendLimit,
  useUserSpendLimit,
} from "@app/lib/swr/memberships";
import {
  SPEND_LIMIT_EXPIRY_KINDS,
  type SpendLimitExpiryKind,
} from "@app/types/api/users/spend_limit";
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
  Input,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

const MIN_AWU_CREDITS = 0;
const MAX_AWU_CREDITS = 2_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type SpendLimitKind = "default" | "override";

function isSpendLimitKind(value: string): value is SpendLimitKind {
  return value === "default" || value === "override";
}

type ExpiryMode = SpendLimitExpiryKind;

function isExpiryMode(value: string): value is ExpiryMode {
  return (SPEND_LIMIT_EXPIRY_KINDS as readonly string[]).includes(value);
}

function formatShortDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface EditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: WorkspaceType;
  // When set, the modal skips the "workspace default vs. custom limit"
  // choice and opens straight into the custom-limit form. Used by the
  // "Set credit amount" request-resolution action, where the admin has
  // already decided a specific amount is what's needed.
  forceOverride?: boolean;
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
  forceOverride = false,
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
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("never");
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  // The amount currently persisted, if any — used to warn when the admin is
  // about to lower it (see the ContentMessage below). Distinct from
  // `creditsInput`, which tracks the in-progress edit.
  const currentAwuCredits =
    spendLimit?.kind === "limited" ? spendLimit.awuCredits : null;

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
        setExpiryMode(spendLimit.expiresAt ? "one_day" : "never");
        break;
      case "unlimited":
        setKind(forceOverride ? "override" : "default");
        setCreditsInput("");
        setExpiryMode("never");
        break;
      default:
        assertNeverAndIgnore(spendLimit);
    }
    setValidationMessage(null);
  }, [isOpen, spendLimit, forceOverride]);

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
        assertNever(kind);
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
      let limit:
        | { kind: "unlimited" }
        | { kind: "limited"; awuCredits: number; expiresAt: number | null };
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
            case "one_day":
              expiresAt = Date.now() + ONE_DAY_MS;
              break;
            case "next_credit_reset":
              expiresAt = spendLimit?.nextCreditResetAt ?? null;
              break;
            default:
              assertNever(expiryMode);
          }
          limit = {
            kind: "limited",
            awuCredits: result.awuCredits,
            expiresAt,
          };
          break;
        }
        default:
          assertNever(kind);
      }
      const body = await doUpdateSpendLimit({
        memberId: displayedMember.sId,
        memberName: displayedMember.name,
        limit,
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

  const parsedCreditsInput = Number(creditsInput);
  const showsLoweringWarning =
    kind === "override" &&
    currentAwuCredits !== null &&
    creditsInput.length > 0 &&
    Number.isInteger(parsedCreditsInput) &&
    parsedCreditsInput < currentAwuCredits;

  const validateDisabled =
    isSaving ||
    isSpendLimitLoading ||
    (kind === "override" && creditsInput.length === 0);
  const primaryDisabled = isSpendLimitError
    ? isSaving || isSpendLimitLoading
    : validateDisabled;

  const overrideForm = (
    <div className="flex flex-col gap-1.5 pl-6">
      <Input
        id="spend-credit-limit-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="1,000"
        value={creditsInput !== "" ? Number(creditsInput).toLocaleString() : ""}
        onChange={(e) => handleCreditsChange(e.target.value)}
        isError={validationMessage !== null}
        message={validationMessage ?? undefined}
        messageStatus={validationMessage !== null ? "error" : undefined}
        className="text-right"
        suffix="credits/month"
      />
      {displayedMember && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">
            Current allowed overage:&nbsp;
            {(currentAwuCredits ?? 0).toLocaleString("en-US")} credits
          </p>
          <p className="text-xs text-muted-foreground">
            Current overage consumption:&nbsp;
            {displayedMember.consumedFromPoolAwuCredits.toLocaleString("en-US")}
            &nbsp;credits
          </p>
        </div>
      )}
      {showsLoweringWarning && (
        <ContentMessage
          size="sm"
          variant="warning"
          title="This lowers the member's limit"
        >
          <p>Won&apos;t unblock them until usage drops below the new limit.</p>
        </ContentMessage>
      )}
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
            value="one_day"
            id="spend-limit-expiry-one-day"
            label="In 1 day"
          />
          {spendLimit?.nextCreditResetAt && (
            <RadioGroupItem
              value="next_credit_reset"
              id="spend-limit-expiry-next-credit-reset"
              label={`At next credit refresh (${formatShortDate(spendLimit.nextCreditResetAt)})`}
            />
          )}
          <RadioGroupItem
            value="never"
            id="spend-limit-expiry-never"
            label="Forever"
          />
        </RadioGroup>
      </div>
    </div>
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
            overrideForm
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

              {kind === "override" && overrideForm}
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
