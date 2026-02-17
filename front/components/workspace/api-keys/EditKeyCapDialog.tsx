import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  dollarsToMicroUsd,
  microUsdToDollarsString,
  monthlyCapDollarsSchema,
} from "@app/components/workspace/api-keys/utils";
import type { KeyType } from "@app/types/key";
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
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  capValueDollars: monthlyCapDollarsSchema,
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
    const dollars =
      data.capValueDollars === "" ? null : parseFloat(data.capValueDollars);
    await onSave(dollarsToMicroUsd(dollars));
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
