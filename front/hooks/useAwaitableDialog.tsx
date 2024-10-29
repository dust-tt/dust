import { Dialog } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";
import { useState } from "react";

type ShowDialogProps = Omit<
  ComponentProps<typeof Dialog>,
  "isOpen" | "onCancel" | "onValidate"
>;
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

  const DialogRenderer = () =>
    dialogState.props ? (
      <Dialog
        {...dialogState.props}
        isOpen={dialogState.isOpen}
        onCancel={handleCancel}
        onValidate={handleConfirm}
      />
    ) : null;

  return {
    AwaitableDialog: DialogRenderer,
    showDialog,
  };
}
