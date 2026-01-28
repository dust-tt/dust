import {
  Input,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import type { KeyType } from "@app/types";

const formSchema = z.object({
  capValueDollars: z.string().refine(
    (value) => {
      if (value === "") {
        return true;
      }
      const dollars = parseFloat(value);
      return !/[a-zA-Z]/.test(value) && !isNaN(dollars) && dollars >= 0;
    },
    { message: "Cap must be a positive number" }
  ),
});

type FormValues = z.infer<typeof formSchema>;

function microUsdToDollarsString(microUsd: number | null): string {
  if (microUsd === null) {
    return "";
  }
  return (microUsd / 1_000_000).toString();
}

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
    mode: "onChange",
    defaultValues: {
      capValueDollars: microUsdToDollarsString(keyData.monthlyCapMicroUsd),
    },
  });

  const { handleSubmit, reset, formState } = form;

  useEffect(() => {
    reset({
      capValueDollars: microUsdToDollarsString(keyData.monthlyCapMicroUsd),
    });
  }, [keyData, reset]);

  const onSubmit = async (data: FormValues) => {
    const monthlyCapMicroUsd =
      data.capValueDollars === ""
        ? null
        : Math.round(parseFloat(data.capValueDollars) * 1_000_000);
    await onSave(monthlyCapMicroUsd);
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
          <FormProvider {...form}>
            <BaseFormFieldSection
              title="Monthly cap (USD)"
              fieldName="capValueDollars"
            >
              {({ registerRef, registerProps, onChange, errorMessage }) => (
                <Input
                  ref={registerRef}
                  {...registerProps}
                  onChange={onChange}
                  placeholder="Leave empty for unlimited"
                  type="number"
                  min="0"
                  step="0.01"
                  isError={!!errorMessage}
                  message={errorMessage}
                  messageStatus="error"
                />
              )}
            </BaseFormFieldSection>
          </FormProvider>
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
            disabled: isSaving || !formState.isValid,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
