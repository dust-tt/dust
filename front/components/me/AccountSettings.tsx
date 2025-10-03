import { Button, Input, Label, Page, Spinner, Tooltip } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { usePatchUser } from "@app/lib/swr/user";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types";

interface AccountSettingsProps {
  user: UserTypeWithWorkspaces | null;
  isUserLoading: boolean;
  owner: WorkspaceType;
}

const AccountSettingsSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  profilePictureUrl: z.string().nullable(),
});

type AccountSettingsType = z.infer<typeof AccountSettingsSchema>;

export function AccountSettings({
  user,
  isUserLoading,
  owner,
}: AccountSettingsProps) {
  const { register, handleSubmit, reset, formState, setValue, watch } =
    useForm<AccountSettingsType>({
      defaultValues: {
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        profilePictureUrl: user?.image ?? null,
      },
    });

  const { patchUser } = usePatchUser();
  const isProvisioned = user?.origin === "provisioned";

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "avatar",
  });

  const profilePictureUrl = watch("profilePictureUrl");
  const currentImageUrl = profilePictureUrl ?? ANONYMOUS_USER_IMAGE_URL;

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        profilePictureUrl: user.image ?? null,
      });
    }
  }, [user, reset]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingImage(true);
    const files = await fileUploaderService.handleFilesUpload([file]);
    setIsUploadingImage(false);

    if (files && files.length > 0 && files[0].publicUrl) {
      setValue("profilePictureUrl", files[0].publicUrl, { shouldDirty: true });
    }
  };

  const updateUserProfile = async (data: AccountSettingsType) => {
    await patchUser(
      data.firstName,
      data.lastName,
      true,
      undefined,
      data.profilePictureUrl
    );
  };

  const handleCancel = () => {
    reset({
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
    });
  };

  if (isUserLoading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }

  const renderNameInput = ({
    label,
    fieldName,
  }: {
    label: string;
    fieldName: "firstName" | "lastName";
  }) => {
    const input = (
      <Input
        label={label}
        {...register(fieldName)}
        placeholder={label}
        disabled={isProvisioned}
      />
    );

    if (isProvisioned) {
      return (
        <Tooltip
          label="Your name is managed by your identity provider and cannot be edited."
          tooltipTriggerAsChild
          trigger={input}
        />
      );
    }

    return input;
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleImageUpload}
      />

      <Page.Horizontal>
        <Label>Email</Label>
        <Label className="text-muted-foreground dark:text-muted-foreground-night">
          {user?.email}
        </Label>
      </Page.Horizontal>

      <Page.Horizontal>
        <Label>Profile Picture</Label>
        <div className="flex items-center gap-4">
          <img
            src={currentImageUrl}
            alt="Profile"
            className="h-16 w-16 rounded-full object-cover"
          />
          <Button
            label={isUploadingImage ? "Uploading..." : "Change Picture"}
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage}
            loading={isUploadingImage}
          />
        </div>
      </Page.Horizontal>

      <form onSubmit={handleSubmit(updateUserProfile)}>
        <Page.Vertical sizing="grow" align="stretch">
          <Page.Horizontal sizing="grow">
            <Page.Vertical sizing="grow" align="stretch">
              {renderNameInput({
                label: "First Name",
                fieldName: "firstName",
              })}
            </Page.Vertical>
            <Page.Vertical sizing="grow" align="stretch">
              {renderNameInput({
                label: "Last Name",
                fieldName: "lastName",
              })}
            </Page.Vertical>
          </Page.Horizontal>

          <Page.Horizontal align="right">
            <Button
              label="Cancel"
              variant="ghost"
              onClick={handleCancel}
              type="button"
              disabled={!formState.isDirty || formState.isSubmitting}
            />
            <Button
              label="Save"
              variant="primary"
              type="submit"
              disabled={!formState.isDirty || formState.isSubmitting}
              loading={formState.isSubmitting}
            />
          </Page.Horizontal>
        </Page.Vertical>
      </form>
    </>
  );
}
