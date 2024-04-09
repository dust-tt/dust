import React, { useCallback, useState } from "react";

import { Dialog, ModalProps } from "./Dialog";

type ElementDialogProps<T> = Omit<
  ModalProps,
  "isOpen" | "onValidate" | "onCancel"
> & {
  openOnElement: T | null;
  onValidate: (closeDialogFn: () => void) => void;
  onCancel: (closeDialogFn: () => void) => void;
  closeDialogFn: () => void;
};

export function ElementDialog<T>({
  openOnElement,
  closeDialogFn,
  onValidate,
  onCancel,
  ...props
}: ElementDialogProps<T>) {
  const [isClosingTransition, setIsClosingTransition] = useState(false);
  const transitionOnClose = useCallback(() => {
    setIsClosingTransition(true);
    setTimeout(() => {
      closeDialogFn();
      setIsClosingTransition(false);
    }, 200);
  }, [closeDialogFn]);
  return (
    <Dialog
      isOpen={openOnElement !== null && !isClosingTransition}
      onCancel={() => onCancel(transitionOnClose)}
      onValidate={() => onValidate(transitionOnClose)}
      {...props}
    />
  );
}
