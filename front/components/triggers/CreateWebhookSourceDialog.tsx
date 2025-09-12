import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormProvider } from "@app/components/sparkle/FormProvider";
import type { CreateWebhookSourceFormData } from "@app/components/triggers/CreateWebhookSourceForm";
import {
  CreateWebhookSourceFormContent,
  CreateWebhookSourceSchema,
  validateCustomHeadersFromString,
} from "@app/components/triggers/CreateWebhookSourceForm";
import { useCreateWebhookSource } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";

type CreateWebhookSourceDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  owner: LightWorkspaceType;
};

export function CreateWebhookSourceDialog({
  isOpen,
  setIsOpen,
  owner,
}: CreateWebhookSourceDialogProps) {
  const form = useForm<CreateWebhookSourceFormData>({
    resolver: zodResolver(CreateWebhookSourceSchema),
    defaultValues: {
      name: "",
      secret: "",
      signatureHeader: "",
      signatureAlgorithm: "sha256",
      customHeaders: null,
    },
  });

  const close = () => {
    form.reset();
    setIsOpen(false);
  };

  const createWebhookSource = useCreateWebhookSource({ owner });

  const onSubmit = async (data: CreateWebhookSourceFormData) => {
    const parsedCustomHeaders = validateCustomHeadersFromString(
      data.customHeaders
    );

    const apiData = {
      ...data,
      customHeaders: parsedCustomHeaders?.parsed ?? null,
    };

    await createWebhookSource(apiData);

    close();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !form.formState.isValidating && close()}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Create Webhook Source</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <FormProvider form={form} onSubmit={onSubmit} className="space-y-4">
            <CreateWebhookSourceFormContent form={form} />
          </FormProvider>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: close,
          }}
          rightButtonProps={{
            isLoading: form.formState.isSubmitting,
            label: "Save",
            variant: "primary",
            onClick: form.handleSubmit(onSubmit),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
