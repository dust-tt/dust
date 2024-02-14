import React, { useCallback, useState } from "react";

import { Modal, ModalProps } from "./Modal";

type ElementModalProps<T> = Omit<ModalProps, "isOpen" | "onSave"> & {
  openOnElement: T | null;
  onSave?: (closeModalFn: () => void) => void;
};

export function ElementModal<T>({
  openOnElement,
  onClose,
  onSave,
  ...props
}: ElementModalProps<T>) {
  const [isClosingTransition, setIsClosingTransition] = useState(false);
  const transitionOnClose = useCallback(() => {
    setIsClosingTransition(true);
    setTimeout(() => {
      onClose();
      setIsClosingTransition(false);
    }, 200);
  }, [onClose]);
  return (
    <Modal
      isOpen={openOnElement !== null && !isClosingTransition}
      onClose={transitionOnClose}
      onSave={onSave ? () => onSave(transitionOnClose) : undefined}
      {...props}
    />
  );
}
