import {
  Input,
  Label,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { KeyType } from "@app/types";

const formSchema = z.object({
  capValueDollars: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditKeyCapDialogProps {
  keyData: KeyType;
  isOpen: boolean;
  onClose: () => void;
  onSave: (monthlyCapMicroUsd: number | null) => Promise<void>;
  isSaving: boolean;
}

export function EditKeyCapDialog({
  keyData,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: EditKeyCapDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      capValueDollars:
        keyData.monthlyCapMicroUsd !== null
          ? (keyData.monthlyCapMicroUsd / 1_000_000).toString()
          : "",
    },
  });

  const { setValue } = form;

  useEffect(() => {
    setValue(
      "capValueDollars",
      keyData.monthlyCapMicroUsd !== null
        ? (keyData.monthlyCapMicroUsd / 1_000_000).toString()
        : ""
    );
  }, [keyData, setValue]);

  const capValueDollars = form.watch("capValueDollars");

  const isValidCap = () => {
    if (capValueDollars === "") {
      return true;
    }
    const dollars = parseFloat(capValueDollars);
    return !isNaN(dollars) && dollars >= 0;
  };

  const handleSave = async () => {
    if (!isValidCap()) {
      return;
    }
    if (capValueDollars === "") {
      await onSave(null);
    } else {
      const dollars = parseFloat(capValueDollars);
      await onSave(Math.round(dollars * 1_000_000));
    }
    onClose();
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Monthly Cap - {keyData.name}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-2">
            <Label>Monthly cap (USD)</Label>
            <Input
              {...form.register("capValueDollars")}
              placeholder="Leave empty for unlimited"
              type="number"
              min="0"
              step="0.01"
            />
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: handleSave,
            disabled: isSaving || !isValidCap(),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
