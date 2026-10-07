import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  creditsToString,
  parseCreditsString,
  getMonthlyCapCreditsSchema,
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
    capValueCredits: getMonthlyCapCreditsSchema(t),
  });
}

type FormValues = z.infer<ReturnType<typeof getFormSchema>>;

interface EditKeyCreditCapDialogProps {
  keyData: KeyType;
  isOpen: boolean;
  onClose: () => void;
  onSave: (monthlyCapAwuCredits: number | null) => Promise<void>;
  isSaving: boolean;
}

export function EditKeyCreditCapDialog({
  keyData,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: EditKeyCreditCapDialogProps) {
  const { t } = useLingui();
  const formSchema = useMemo(() => getFormSchema(t), [t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      capValueCredits: creditsToString(keyData.monthlyCapAwuCredits),
    },
  });

  const { handleSubmit, reset, formState } = form;

  useEffect(() => {
    reset({
      capValueCredits: creditsToString(keyData.monthlyCapAwuCredits),
    });
  }, [keyData, reset]);

  const onSubmit = async (data: FormValues) => {
    await onSave(parseCreditsString(data.capValueCredits));
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
            <Trans>Edit credit cap - {keyName}</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <FormProvider {...form}>
            <BaseFormFieldSection
              title={t`Monthly credit cap`}
              fieldName="capValueCredits"
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
