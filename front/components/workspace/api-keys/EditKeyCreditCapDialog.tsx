import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  creditsToString,
  monthlyCapCreditsSchema,
  parseCreditsString,
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
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  capValueCredits: monthlyCapCreditsSchema,
});

type FormValues = z.infer<typeof formSchema>;

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
          <SheetTitle>Edit credit cap - {keyData.name}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <FormProvider {...form}>
            <BaseFormFieldSection
              title="Monthly credit cap"
              fieldName="capValueCredits"
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
