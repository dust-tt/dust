import React, { useState } from "react";

import { Modal, ModalProps } from "./Modal";

type ElementModalProps<T> = Omit<ModalProps, "isOpen"> & {
  openOnElement: T | null;
};

export function ElementModal<T>({
  openOnElement,
  ...props
}: ElementModalProps<T>) {
  const { onClose } = props;
  const [isClosingTransition, setIsClosingTransition] = useState(false);
  const realOnClose = () => {
    setIsClosingTransition(true);
    setTimeout(() => {
      onClose();
      setIsClosingTransition(false);
    }, 200);
  };
  props.onClose = realOnClose;
  return (
    <Modal isOpen={openOnElement !== null && !isClosingTransition} {...props} />
  );
}
