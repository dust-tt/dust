import type { Button } from "@dust-tt/sparkle";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

type ShowDialogProps = {
  title: string;
  children: React.ReactNode;
  alertDialog?: boolean;
  validateLabel?: string;
  validateVariant?: React.ComponentProps<typeof Button>["variant"];
  cancelLabel?: string;
};

interface DialogState {
  isOpen: boolean;
  props: ShowDialogProps | null;
  resolve?: (value: boolean) => void;
}

export function useAwaitableDialog() {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    props: null,
  });

  const showDialog = (props: ShowDialogProps): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        props,
        resolve,
      });
    });
  };

  const handleConfirm = () => {
    dialogState.resolve?.(true);
    setDialogState({ isOpen: false, props: null });
  };

  const handleCancel = () => {
    dialogState.resolve?.(false);
    setDialogState({ isOpen: false, props: null });
  };

  const AwaitableDialog = () => {
    if (!dialogState.props) {
      return null;
    }

    const {
      title,
      children,
      alertDialog,
      validateLabel,
      validateVariant,
      cancelLabel,
    } = dialogState.props;

    return (
      <Dialog
        open={dialogState.isOpen}
        // If user dismisses the dialog some other way (e.g. clicking outside when not alert), treat it as cancel:
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
      >
        <DialogContent
          isAlertDialog={alertDialog}
          trapFocusScope={!!alertDialog}
        >
          <DialogHeader hideButton={true}>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogContainer>{children}</DialogContainer>

          <DialogFooter
            leftButtonProps={
              cancelLabel
                ? {
                    label: cancelLabel,
                    variant: "outline",
                    onClick: handleCancel,
                  }
                : undefined
            }
            rightButtonProps={{
              label: validateLabel ?? "Ok",
              variant: validateVariant ?? "primary",
              onClick: handleConfirm,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  };

  return {
    AwaitableDialog,
    showDialog,
  };
}
