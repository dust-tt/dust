import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { useRequestUpgrade } from "@app/lib/swr/upgrade_requests";
import { MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS } from "@app/types/memberships";
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
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

function getRequestUpgradeFormSchema(requireReason: boolean) {
  return z.object({
    reason: requireReason
      ? z
          .string()
          .trim()
          .min(1, "A reason is required to submit an upgrade request.")
          .max(MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS)
      : z.string().trim().max(MAX_UPGRADE_REQUEST_REASON_LENGTH_CHARS),
  });
}

type RequestUpgradeFormValues = z.infer<
  ReturnType<typeof getRequestUpgradeFormSchema>
>;

type UsageUpgradeButtonVariant = "link" | "button";

interface UsageUpgradeButtonProps {
  owner: LightWorkspaceType;
  hasPendingUpgradeRequest: boolean;
  variant?: UsageUpgradeButtonVariant;
  isManager?: boolean;
  requireReason?: boolean;
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
  requireReason = false,
  onManagerNavigate,
}: UsageUpgradeButtonProps) {
  const { doRequestUpgrade } = useRequestUpgrade({ workspaceId: owner.sId });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  const form = useForm<RequestUpgradeFormValues>({
    resolver: zodResolver(getRequestUpgradeFormSchema(requireReason)),
    defaultValues: { reason: "" },
  });

  const alreadyRequested = hasPendingUpgradeRequest || requested;

  const onSubmit = async (values: RequestUpgradeFormValues) => {
    const trimmedReason = values.reason.trim();
    const result = await doRequestUpgrade({
      reason: trimmedReason.length > 0 ? trimmedReason : undefined,
    });
    if (result.ok) {
      setRequested(true);
      setIsDialogOpen(false);
      form.reset();
      return;
    }
    if (result.errorType === "invalid_request_error") {
      form.setError("reason", { type: "manual", message: result.message });
    }
  };

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
                  Your workspace admins and managers will review this request.
                </p>
                <BaseFormFieldSection<HTMLTextAreaElement>
                  fieldName="reason"
                  title={
                    requireReason
                      ? "Help your admin decide (required)"
                      : "Help your admin decide"
                  }
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
                        placeholder="e.g. processing a large batch of documents for this quarter's audit"
                        rows={3}
                        showErrorLabel={showError}
                        error={showError ? errorMessage : undefined}
                        onChange={onChange}
                        {...registerProps}
                      />
                    );
                  }}
                </BaseFormFieldSection>
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
