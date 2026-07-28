import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useRequestUpgrade } from "@app/lib/swr/upgrade_requests";
import {
  MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS,
  MIN_UPGRADE_REQUEST_REASON_LENGTH_CHARS,
} from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  RadioGroup,
  RadioGroupItem,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { FormProvider, useController, useForm } from "react-hook-form";
import { z } from "zod";

const DURATION_PRESETS_DAYS = [1, 7, 30] as const;

const requestUpgradeFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      MIN_UPGRADE_REQUEST_REASON_LENGTH_CHARS,
      "Tell your admin why you need this."
    )
    .max(MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS),
  requestedDurationDays: z.number().int().min(1),
});

type RequestUpgradeFormValues = z.infer<typeof requestUpgradeFormSchema>;

function durationLabel(days: number): string {
  switch (days) {
    case 1:
      return "A day";
    case 7:
      return "A week";
    case 30:
      return "A month";
    default:
      return `${days} days`;
  }
}

const DURATION_FIELD_LABEL_ID = "upgrade-request-duration-label";

function DurationField() {
  const { field } = useController<RequestUpgradeFormValues>({
    name: "requestedDurationDays",
  });

  return (
    <div className="flex flex-col gap-2">
      <label id={DURATION_FIELD_LABEL_ID} className="text-sm font-medium">
        How long do you need it?
      </label>
      <RadioGroup
        aria-labelledby={DURATION_FIELD_LABEL_ID}
        value={String(field.value)}
        onValueChange={(v) => field.onChange(Number(v))}
        className="flex flex-row gap-4"
      >
        {DURATION_PRESETS_DAYS.map((days) => (
          <RadioGroupItem
            key={days}
            value={String(days)}
            id={`upgrade-request-duration-${days}`}
            label={durationLabel(days)}
          />
        ))}
      </RadioGroup>
    </div>
  );
}

type UsageUpgradeButtonVariant = "link" | "button";

interface UsageUpgradeButtonProps {
  owner: LightWorkspaceType;
  hasPendingUpgradeRequest: boolean;
  variant?: UsageUpgradeButtonVariant;
  isManager?: boolean;
  onManagerNavigate?: () => void;
}

// Member-initiated upgrade-request CTA. Opens a confirmation dialog and posts
// the request via `useRequestUpgrade`. Rendered either as an inline link (usage
// banner) or as a primary button (personal settings) through `variant`.
export function UsageUpgradeButton({
  owner,
  hasPendingUpgradeRequest,
  variant = "link",
  isManager = false,
  onManagerNavigate,
}: UsageUpgradeButtonProps) {
  const { hasFeature } = useFeatureFlags();
  const isAdminGovernanceEnabled = hasFeature("admin_governance");
  const { doRequestUpgrade } = useRequestUpgrade({ workspaceId: owner.sId });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  const form = useForm<RequestUpgradeFormValues>({
    resolver: zodResolver(requestUpgradeFormSchema),
    defaultValues: { reason: "", requestedDurationDays: 7 },
  });

  const alreadyRequested = hasPendingUpgradeRequest || requested;

  async function onSubmit(values: RequestUpgradeFormValues) {
    const ok = await doRequestUpgrade(values);
    if (ok) {
      setRequested(true);
      setIsDialogOpen(false);
      form.reset();
    }
  }

  function renderTrigger() {
    if (isManager) {
      const usageHref = `/w/${owner.sId}/usage`;

      if (variant === "button") {
        return (
          <Button
            variant="primary"
            size="xs"
            label="Go to workspace usage"
            href={usageHref}
            onClick={onManagerNavigate}
          />
        );
      }

      return (
        <Hoverable
          variant="primary"
          className="copy-sm underline underline-offset-2"
          href={usageHref}
          onClick={onManagerNavigate}
        >
          Go to workspace usage
        </Hoverable>
      );
    }

    if (variant === "button") {
      return (
        <Button
          variant="primary"
          size="xs"
          label={alreadyRequested ? "Requested" : "Request for upgrade"}
          disabled={alreadyRequested}
          onClick={() => setIsDialogOpen(true)}
        />
      );
    }

    if (alreadyRequested) {
      return (
        <span className="copy-sm text-muted-foreground">Request sent</span>
      );
    }

    return (
      <Hoverable
        variant="primary"
        className="copy-sm underline underline-offset-2"
        onClick={() => setIsDialogOpen(true)}
      >
        Request an upgrade
      </Hoverable>
    );
  }

  return (
    <>
      {renderTrigger()}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && setIsDialogOpen(false)}
      >
        <DialogContent size="md">
          <FormProvider {...form}>
            <DialogHeader>
              <DialogTitle>Request a usage limit upgrade</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Your workspace{" "}
                  {isAdminGovernanceEnabled ? "admins and managers" : "admins"}{" "}
                  will be notified that you'd like your usage limit increased.
                  They'll review your request and get back to you.
                </p>
                <BaseFormFieldSection<HTMLTextAreaElement>
                  fieldName="reason"
                  title="Why do you need this?"
                >
                  {({
                    registerRef,
                    registerProps,
                    onChange,
                    errorMessage,
                    fieldState,
                  }) => {
                    const showError =
                      fieldState.isDirty ||
                      fieldState.isTouched ||
                      form.formState.isSubmitted;

                    return (
                      <TextArea
                        ref={registerRef}
                        placeholder="e.g. running a large one-off backfill this week"
                        rows={3}
                        showErrorLabel={showError}
                        error={showError ? errorMessage : undefined}
                        onChange={onChange}
                        {...registerProps}
                      />
                    );
                  }}
                </BaseFormFieldSection>
                <DurationField />
              </div>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setIsDialogOpen(false),
              }}
              rightButtonProps={{
                label: "Send request",
                variant: "primary",
                isLoading: form.formState.isSubmitting,
                disabled: form.formState.isSubmitting,
                onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                  // The button is wrapped in Radix's DialogClose, which closes the
                  // dialog on click unless prevented. Closing must instead happen
                  // only after a successful submit, inside `onSubmit`.
                  event.preventDefault();
                  void form.handleSubmit(onSubmit)();
                },
              }}
            />
          </FormProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}
