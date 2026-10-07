import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  dollarsToMicroUsd,
  microUsdToDollarsString,
  useMonthlyCapDollarsSchema,
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

function useFormSchema() {
  const monthlyCapDollarsSchema = useMonthlyCapDollarsSchema();

  return useMemo(
    () =>
      z.object({
        capValueDollars: monthlyCapDollarsSchema,
      }),
    [monthlyCapDollarsSchema]
  );
}

type FormValues = z.infer<ReturnType<typeof useFormSchema>>;

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
  const { t } = useLingui();
  const formSchema = useFormSchema();
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

  const keyName = keyData.name;

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
          <SheetTitle>
            <Trans>Edit Monthly Cap - {keyName}</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <FormProvider {...form}>
            <BaseFormFieldSection
              title={t`Monthly cap (USD)`}
              fieldName="capValueDollars"
            >
              {({ registerRef, registerProps, onChange, errorMessage }) => (
                <Input
                  ref={registerRef}
                  {...registerProps}
                  onChange={onChange}
                  placeholder={t`Leave empty for unlimited`}
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
            label: t`Cancel`,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: t`Save`,
            variant: "primary",
            onClick: handleSubmit(onSubmit),
            disabled: isSaving || !formState.isValid,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
