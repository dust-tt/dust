import type { Button } from "@dust-tt/sparkle";
import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
// Define whichever props you need your dialog to support.
// Adapt these to match your old usage: title, children, alertDialog, etc.
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
      <NewDialog
        open={dialogState.isOpen}
        // If user dismisses the dialog some other way (e.g. clicking outside when not alert), treat it as cancel:
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
      >
        <NewDialogContent
          isAlertDialog={alertDialog}
          trapFocusScope={!!alertDialog}
        >
          <NewDialogHeader hideButton={true}>
            <NewDialogTitle>{title}</NewDialogTitle>
          </NewDialogHeader>
          <NewDialogContainer>{children}</NewDialogContainer>

          <NewDialogFooter
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
        </NewDialogContent>
      </NewDialog>
    );
  };

  return {
    AwaitableDialog,
    showDialog,
  };
}
