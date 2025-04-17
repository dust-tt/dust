import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import React from "react";

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
      <ConfirmDialog
        confirmData={confirmData}
        resolveConfirm={resolveConfirmRef.current}
        closeDialogFn={() => setConfirmData(null)}
      />
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
    <Dialog
      open={confirmData != null}
      onOpenChange={(open) => {
        if (!open) {
          resolveConfirm(false);
          closeDialogFn();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader hideButton>
          <DialogTitle>{confirmData?.title ?? ""}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <DialogDescription>{confirmData?.message ?? ""}</DialogDescription>
        </DialogContainer>
        <DialogFooter
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
      </DialogContent>
    </Dialog>
  );
}
