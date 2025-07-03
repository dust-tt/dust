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
import { z } from "zod";

import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useCreateTag } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

export const MAX_TAG_LENGTH = 100;

interface TagCreationDialogProps {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  addTag: (tag: TagType) => void;
}

const tagSchema = z.object({
  tag: z
    .string()
    .min(1, "Tag name is required")
    .max(MAX_TAG_LENGTH, `Tag name cannot exceed ${MAX_TAG_LENGTH} characters`),
});

type TagForm = z.infer<typeof tagSchema>;

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
    <FormProvider<TagForm> form={form} onSubmit={onFormSubmit}>
      <DialogHeader>
        <DialogTitle>Add tag</DialogTitle>
        <DialogDescription>Create a new tag for your agent</DialogDescription>
      </DialogHeader>
      <DialogContainer>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <div className="flex space-x-2">
            <div className="flex-grow">
              <Input
                maxLength={MAX_TAG_LENGTH}
                id="name"
                placeholder="Tag name"
                autoFocus
                {...register("tag")}
                message={errors.tag?.message}
              />
            </div>
          </div>
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
