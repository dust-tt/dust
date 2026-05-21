import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useUpdateUserSpendLimit,
  useUserSpendLimit,
} from "@app/lib/swr/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionCreditCoinsIcon,
  Avatar,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

const MIN_AWU_CREDITS = 1;
const MAX_AWU_CREDITS = 1_000_000;

type SpendLimitKind = "unlimited" | "limited";

function isSpendLimitKind(value: string): value is SpendLimitKind {
  return value === "unlimited" || value === "limited";
}

interface EditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType;
  owner: WorkspaceType;
}

export function EditSpendLimitModal({
  isOpen,
  onClose,
  member,
  owner,
}: EditSpendLimitModalProps) {
  const { spendLimit, isSpendLimitLoading } = useUserSpendLimit({
    workspaceId: owner.sId,
    memberId: member.sId,
    disabled: !isOpen,
  });
  const { doUpdateSpendLimit } = useUpdateUserSpendLimit({
    workspaceId: owner.sId,
  });

  const [kind, setKind] = useState<SpendLimitKind>("limited");
  const [creditsInput, setCreditsInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!spendLimit) {
      return;
    }
    switch (spendLimit.kind) {
      case "limited":
        setKind("limited");
        setCreditsInput(String(spendLimit.awuCredits));
        break;
      case "unlimited":
        setKind("unlimited");
        setCreditsInput("");
        break;
      default:
        assertNeverAndIgnore(spendLimit);
    }
    setValidationMessage(null);
  }, [isOpen, spendLimit]);

  function handleSelectKind(next: SpendLimitKind) {
    setKind(next);
    setValidationMessage(null);
  }

  function handleCreditsChange(value: string) {
    // Keep only digits — credits are integers and the API range starts at 1.
    const cleaned = value.replace(/[^\d]/g, "");
    setCreditsInput(cleaned);
    setValidationMessage(null);
  }

  function validate(): { ok: true; awuCredits: number } | { ok: false } {
    switch (kind) {
      case "unlimited":
        return { ok: true, awuCredits: 0 };
      case "limited": {
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

    setIsSaving(true);
    try {
      let limit:
        | { kind: "unlimited" }
        | { kind: "limited"; awuCredits: number };
      switch (kind) {
        case "unlimited":
          limit = { kind: "unlimited" };
          break;
        case "limited":
          limit = { kind: "limited", awuCredits: result.awuCredits };
          break;
        default:
          assertNeverAndIgnore(kind);
          return;
      }
      const body = await doUpdateSpendLimit({
        memberId: member.sId,
        memberName: member.name,
        limit,
      });
      if (body) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  const validateDisabled =
    isSaving ||
    isSpendLimitLoading ||
    (kind === "limited" && creditsInput.length === 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar
              visual={member.image ?? undefined}
              name={member.name}
              size="md"
              isRounded
            />
            <div>
              <DialogTitle>Edit spend limit for {member.name}</DialogTitle>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                They will be able to consume this amount from the pool after
                reaching their plan usage limit.
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          {isSpendLimitLoading ? (
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
                value="unlimited"
                id="spend-limit-unlimited"
                label="Unlimited spend"
              />
              <RadioGroupItem
                value="limited"
                id="spend-limit-limited"
                label="Set credit amount"
              />

              {kind === "limited" && (
                <div className="flex flex-col gap-1.5 pl-6">
                  <label
                    htmlFor="spend-credit-limit-input"
                    className="text-sm font-medium text-foreground dark:text-foreground-night"
                  >
                    Spend credit limit
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                      <Icon visual={ActionCreditCoinsIcon} size="xs" />
                    </div>
                    <Input
                      id="spend-credit-limit-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="1000"
                      value={creditsInput}
                      onChange={(e) => handleCreditsChange(e.target.value)}
                      className="pl-8"
                      isError={validationMessage !== null}
                      message={validationMessage ?? undefined}
                      messageStatus={
                        validationMessage !== null ? "error" : undefined
                      }
                    />
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
            label: "Validate",
            variant: "primary",
            disabled: validateDisabled,
            onClick: handleValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
