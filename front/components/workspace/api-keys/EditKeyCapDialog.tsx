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
  onSave: (monthlyCapMicroUsd: number | null) => Promise<boolean>;
  isSaving: boolean;
}

export function EditKeyCapDialog({
  keyData,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: EditKeyCapDialogProps) {
  const { register, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      capValueDollars:
        keyData.monthlyCapMicroUsd !== null
          ? (keyData.monthlyCapMicroUsd / 1_000_000).toString()
          : "",
    },
  });

  useEffect(() => {
    reset({
      capValueDollars:
        keyData.monthlyCapMicroUsd !== null
          ? (keyData.monthlyCapMicroUsd / 1_000_000).toString()
          : "",
    });
  }, [keyData, reset]);

  const capValueDollars = watch("capValueDollars");

  const isValidCap = () => {
    if (capValueDollars === "") {
      return true;
    }
    const dollars = parseFloat(capValueDollars);
    return !isNaN(dollars) && dollars >= 0;
  };

  const onSubmit = async (data: FormValues) => {
    if (!isValidCap()) {
      return;
    }
    const monthlyCapMicroUsd =
      data.capValueDollars === ""
        ? null
        : Math.round(parseFloat(data.capValueDollars) * 1_000_000);
    const success = await onSave(monthlyCapMicroUsd);
    if (success) {
      onClose();
    }
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
              {...register("capValueDollars")}
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
            onClick: handleSubmit(onSubmit),
            disabled: isSaving || !isValidCap(),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
