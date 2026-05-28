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
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ExclamationCircleIcon,
  Icon,
  Input,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

const MIN_AWU_CREDITS = 1;
const MAX_AWU_CREDITS = 1_000_000;

type SpendLimitKind = "default" | "override";

function isSpendLimitKind(value: string): value is SpendLimitKind {
  return value === "default" || value === "override";
}

interface EditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: WorkspaceType;
}

export function EditSpendLimitModal({
  isOpen,
  onClose,
  member,
  owner,
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
        break;
      case "unlimited":
        setKind("default");
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
    try {
      let limit:
        | { kind: "unlimited" }
        | { kind: "limited"; awuCredits: number };
      switch (kind) {
        case "default":
          limit = { kind: "unlimited" };
          break;
        case "override":
          limit = { kind: "limited", awuCredits: result.awuCredits };
          break;
        default:
          assertNeverAndIgnore(kind);
          return;
      }
      const body = await doUpdateSpendLimit({
        memberId: displayedMember.sId,
        memberName: displayedMember.name,
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
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                They will be able to consume this amount from the Workspace
                Credits Pool after reaching their plan usage limit.
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          {isSpendLimitError ? (
            <ContentMessage
              title="Failed to load spend limit"
              icon={ExclamationCircleIcon}
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
                label="Use custom limit"
              />

              {kind === "override" && (
                <div className="flex flex-col gap-1.5 pl-6">
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
