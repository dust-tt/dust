import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  dollarsToMicroUsd,
  microUsdToDollarsString,
  getMonthlyCapDollarsSchema,
  parseDollarsString,
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
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

function getFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({
    capValueDollars: getMonthlyCapDollarsSchema(t),
  });
}

type FormValues = z.infer<ReturnType<typeof getFormSchema>>;

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
  const formSchema = useMemo(() => getFormSchema(t), [t]);
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
    const dollars = parseDollarsString(data.capValueDollars);
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
