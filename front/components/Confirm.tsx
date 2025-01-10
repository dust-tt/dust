import {
  NewDialog,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
} from "@dust-tt/sparkle";
import React from "react";
import { createPortal } from "react-dom";

export type ConfirmDataType = {
  title: string;
  message: string | React.ReactNode;
  validateLabel?: string;
  validateVariant?: "primary" | "warning";
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
    <NewDialog
      open={confirmData != null}
      onOpenChange={(open) => {
        if (!open) {
          resolveConfirm(false);
          closeDialogFn();
        }
      }}
    >
      <NewDialogContent size="md">
        <NewDialogHeader hideButton>
          <NewDialogTitle>{confirmData?.title ?? ""}</NewDialogTitle>
          <NewDialogDescription>
            {confirmData?.message ?? ""}
          </NewDialogDescription>
        </NewDialogHeader>
        <NewDialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => {
              resolveConfirm(false);
              closeDialogFn();
            },
          }}
          rightButtonProps={{
            label: confirmData?.validateLabel ?? "OK",
            variant: "warning",
            onClick: async () => {
              resolveConfirm(true);
              closeDialogFn();
            },
          }}
        />
      </NewDialogContent>
    </NewDialog>
  );
}
