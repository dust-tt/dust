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

  const resolveConfirmRef = useRef<(result: boolean) => void>(() => undefined);

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
        clearConfirmData={() => setConfirmData(null)}
      />
    </ConfirmContext.Provider>
  );
}

interface ConfirmDialogProps {
  clearConfirmData: () => void;
  confirmData: ConfirmDataType | null;
  resolveConfirm: (result: boolean) => void;
}

export function ConfirmDialog({
  confirmData,
  resolveConfirm,
  clearConfirmData,
}: ConfirmDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    setIsDialogOpen(confirmData != null);
  }, [confirmData]);

  // To avoid content flickering, we clear out the current validation when closing animation ends
  // instead of right after clicking on one of the buttons.
  const onDialogAnimationEnd = () => {
    if (!isDialogOpen) {
      clearConfirmData();
    }
  };

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          resolveConfirm(false);
        }
        setIsDialogOpen(open);
      }}
    >
      <DialogContent size="md" onAnimationEnd={onDialogAnimationEnd}>
        <DialogHeader hideButton>
          <DialogTitle>{confirmData?.title ?? ""}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <DialogDescription className="whitespace-normal break-words">
            {confirmData?.message ?? ""}
          </DialogDescription>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => resolveConfirm(false),
          }}
          rightButtonProps={{
            label: confirmData?.validateLabel ?? "OK",
            variant: confirmData?.validateVariant ?? "warning",
            onClick: () => resolveConfirm(true),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
