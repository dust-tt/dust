import { ElementDialog } from "@dust-tt/sparkle";
import React from "react";
import { createPortal } from "react-dom";

export type ConfirmDataType = {
  title: string;
  message: string | React.ReactNode;
  validateLabel?: string;
  validateVariant?: "primary" | "primaryWarning";
};

export const ConfirmContext = React.createContext<
  (n: ConfirmDataType) => Promise<boolean>
>((n) => new Promise((resolve) => resolve(!!n))); // dummy function

export function ConfirmPopupArea({ children }: { children: React.ReactNode }) {
  const [confirmData, setConfirmData] = React.useState<ConfirmDataType | null>(
    null
  );

  const resolveConfirmRef = React.useRef<(result: boolean) => void>(
    () => undefined
  );

  const confirm = (confirm: ConfirmDataType) => {
    setConfirmData(confirm);
    return new Promise<boolean>((resolve) => {
      resolveConfirmRef.current = (t: boolean) => resolve(t);
    });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {typeof window === "object" ? (
        createPortal(
          <ConfirmDialog
            confirmData={confirmData}
            resolveConfirm={resolveConfirmRef.current}
            closeDialogFn={() => setConfirmData(null)}
          />,
          document.body
        )
      ) : (
        // SSR (otherwise hydration issues)
        <ConfirmDialog
          confirmData={confirmData}
          resolveConfirm={resolveConfirmRef.current}
          closeDialogFn={() => setConfirmData(null)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function ConfirmDialog({
  confirmData,
  resolveConfirm,
  closeDialogFn,
}: {
  confirmData: ConfirmDataType | null;
  resolveConfirm: (result: boolean) => void;
  closeDialogFn: () => void;
}) {
  return (
    <ElementDialog
      openOnElement={confirmData}
      title={confirmData?.title || ""}
      closeDialogFn={closeDialogFn}
      onCancel={(closingFn) => {
        resolveConfirm(false);
        closingFn();
      }}
      onValidate={(closingFn) => {
        resolveConfirm(true);
        closingFn();
      }}
      validateLabel={confirmData?.validateLabel}
      validateVariant={confirmData?.validateVariant}
    >
      {confirmData?.message}
    </ElementDialog>
  );
}
