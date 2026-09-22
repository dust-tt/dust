import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useState } from "react";

const UNSAVED_DOCUMENT_WARNING = {
  title: "Discard your unsaved document changes?",
  message: "Your latest edits have not been saved yet.",
  validateLabel: "Discard",
  cancelLabel: "Keep editing",
};

export const useDocumentNavigation = () => {
  const [pending, setPending] = useState(false);
  return [
    pending,
    setPending,
    pending ? <PendingDocumentNavigation /> : null,
  ] as const;
};

const PendingDocumentNavigation = () => {
  useNavigationLock(true, UNSAVED_DOCUMENT_WARNING);
  return null;
};
