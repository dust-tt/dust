import { useSendNotification } from "@app/hooks/useNotification";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useMetronomeContract } from "@app/lib/swr/workspaces";
import {
  Button,
  CardIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CancelContractDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
}

function CancelContractDialog({
  show,
  onClose,
  onValidate,
  isSaving,
}: CancelContractDialogProps) {
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {isSaving ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <div>
              <p>
                Your contract will be ended at the close of the current billing
                period. All workspace data will be deleted and members will lose
                access.
              </p>
              <p className="mt-2 font-bold">
                Are you sure you want to proceed?
              </p>
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Keep subscription",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Yes, cancel subscription",
            variant: "warning",
            onClick: onValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function MetronomeSubscriptionSection() {
  const owner = useWorkspace();
  const sendNotification = useSendNotification();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const {
    metronomeContract,
    isMetronomeContractLoading,
    mutateMetronomeContract,
  } = useMetronomeContract({ workspaceId: owner.sId });

  const { submit: handleCancel, isSubmitting: isCancelling } =
    useSubmitFunction(async () => {
      const res = await clientFetch(`/api/w/${owner.sId}/metronome/contract`, {
        method: "DELETE",
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Cancellation failed",
          description:
            "Failed to cancel the subscription. Please contact support.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Subscription cancelled",
          description:
            "Your contract will end at the close of the current billing period.",
        });
        void mutateMetronomeContract();
      }
      setShowCancelDialog(false);
    });

  if (isMetronomeContractLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="md" />
      </div>
    );
  }

  const proSeats = metronomeContract?.proSeats ?? 0;
  const maxSeats = metronomeContract?.maxSeats ?? 0;
  const estimatedMonthlyCents = metronomeContract?.estimatedMonthlyCents ?? 0;

  return (
    <>
      <CancelContractDialog
        show={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onValidate={handleCancel}
        isSaving={isCancelling}
      />

      <Page.Vertical gap="sm">
        <Page.H variant="h5">Billing</Page.H>

        <Page.P>
          Estimated monthly billing:{" "}
          <span className="font-bold">
            {formatCents(estimatedMonthlyCents)}
          </span>{" "}
          (excluding taxes).
        </Page.P>

        <Page.P>
          {proSeats} Pro {proSeats === 1 ? "seat" : "seats"} ×{" "}
          {formatCents(2900)}/mo
          {maxSeats > 0 && (
            <>
              {" "}
              — {maxSeats} Max {maxSeats === 1 ? "seat" : "seats"} ×{" "}
              {formatCents(9900)}/mo
            </>
          )}
        </Page.P>

        <div className="mt-2">
          <Button
            icon={CardIcon}
            label="Cancel subscription"
            variant="ghost"
            onClick={() => setShowCancelDialog(true)}
          />
        </div>
      </Page.Vertical>
    </>
  );
}
