import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  Input,
  Label,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useCreateTag } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagForm, TagType } from "@app/types/tag";
import { MAX_TAG_LENGTH, tagSchema } from "@app/types/tag";

interface TagCreationDialogProps {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  addTag: (tag: TagType) => void;
}

// This will get unmounted when you close the dialog so
// we don't have to reset the state.
const TagCreationForm = ({
  onFormSubmit,
}: {
  onFormSubmit: (data: TagForm) => void;
}) => {
  const form = useForm<TagForm>({
    resolver: zodResolver(tagSchema),
    defaultValues: {
      tag: "",
    },
  });

  const {
    register,
    formState: { errors, isValid },
  } = form;

  return (
    <FormProvider form={form} onSubmit={onFormSubmit}>
      <DialogHeader>
        <DialogTitle>Add tag</DialogTitle>
        <DialogDescription>Create a new tag for your agent</DialogDescription>
      </DialogHeader>
      <DialogContainer>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            maxLength={MAX_TAG_LENGTH}
            id="name"
            placeholder="Tag name"
            autoFocus
            {...register("tag")}
            message={errors.tag?.message}
          />
        </div>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{
          label: "Cancel",
          variant: "ghost",
        }}
        rightButtonProps={{
          label: "Save",
          variant: "primary",
          type: "submit",
          disabled: !isValid,
        }}
      />
    </FormProvider>
  );
};

// We have to use portal so that we don't render tag creation form inside the
// agent builder form.
export const TagCreationDialog = ({
  owner,
  isOpen,
  setIsOpen,
  addTag,
}: TagCreationDialogProps) => {
  const { createTag } = useCreateTag({ owner });

  const onFormSubmit = async (data: TagForm) => {
    const newTag = await createTag(data.tag);

    if (newTag) {
      addTag(newTag);
    }

    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogPortal>
        <DialogContent size="lg">
          <TagCreationForm onFormSubmit={onFormSubmit} />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
