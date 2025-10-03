import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Label,
  LightModeIcon,
  MoonIcon,
  Page,
  PencilSquareIcon,
  Spinner,
  SunIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { isSubmitMessageKey } from "@app/lib/keymaps";
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
  theme: z.enum(["light", "dark", "system"]).default("system"),
  submitMessageKey: z.enum(["enter", "cmd+enter"]).default("enter"),
});

type AccountSettingsType = z.infer<typeof AccountSettingsSchema>;

export function AccountSettings({
  user,
  isUserLoading,
  owner,
}: AccountSettingsProps) {
  const { theme: currentTheme, setTheme } = useTheme();
  const { register, handleSubmit, reset, formState, setValue, watch } =
    useForm<AccountSettingsType>({
      resolver: zodResolver(AccountSettingsSchema),
      defaultValues: {
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        profilePictureUrl: user?.image ?? null,
        theme: (currentTheme as AccountSettingsType["theme"]) ?? "system",
        submitMessageKey: "enter",
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
  const selectedTheme = watch("theme");
  const submitMessageKey = watch("submitMessageKey");
  const currentImageUrl = profilePictureUrl ?? ANONYMOUS_USER_IMAGE_URL;

  useEffect(() => {
    const storedKey =
      (typeof window !== "undefined" &&
        localStorage.getItem("submitMessageKey")) ??
      null;

    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        profilePictureUrl: user.image ?? null,
        theme: currentTheme ?? "system",
        submitMessageKey:
          storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
      });
    } else {
      // Ensure preferences fields are initialized even without user
      setValue("theme", currentTheme ?? "system", { shouldDirty: false });
      setValue(
        "submitMessageKey",
        storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
        { shouldDirty: false }
      );
    }
  }, [user, reset, currentTheme, setValue]);

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
    const res = await patchUser(
      data.firstName,
      data.lastName,
      true,
      undefined,
      data.profilePictureUrl
    );
    if (res) {
      // Persist preferences upon successful save
      setTheme(data.theme);
      if (typeof window !== "undefined") {
        localStorage.setItem("submitMessageKey", data.submitMessageKey);
      }
    }
  };

  const handleCancel = () => {
    const storedKey =
      (typeof window !== "undefined" &&
        localStorage.getItem("submitMessageKey")) ??
      null;

    reset({
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
      theme: currentTheme ?? "system",
      submitMessageKey:
        storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
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
        isError={!!formState.errors[fieldName]}
        message={formState.errors[fieldName]?.message}
        messageStatus={formState.errors[fieldName] ? "error" : undefined}
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
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="group relative">
              <Avatar size="lg" visual={currentImageUrl ?? null} />
              <Button
                variant="outline"
                size="sm"
                icon={PencilSquareIcon}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                disabled={isUploadingImage}
                loading={isUploadingImage}
              />
            </div>
          </div>
        </div>
      </Page.Horizontal>

      <form
        id="account-settings-form"
        onSubmit={handleSubmit(updateUserProfile)}
      >
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

          <Page.Horizontal>
            <div className="flex gap-2">
              <Label>Email</Label>
              <Label className="text-muted-foreground dark:text-muted-foreground-night">
                {user?.email}
              </Label>
            </div>
          </Page.Horizontal>

          <Page.Horizontal sizing="grow">
            <Page.Vertical sizing="grow" align="stretch">
              <Label>Theme</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    icon={
                      selectedTheme === "light"
                        ? SunIcon
                        : selectedTheme === "dark"
                          ? MoonIcon
                          : LightModeIcon
                    }
                    label={
                      selectedTheme === "light"
                        ? "Light"
                        : selectedTheme === "dark"
                          ? "Dark"
                          : "System"
                    }
                    isSelect
                    className="w-fit"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    icon={SunIcon}
                    onClick={() =>
                      setValue("theme", "light", { shouldDirty: true })
                    }
                    label="Light"
                  />
                  <DropdownMenuItem
                    icon={MoonIcon}
                    onClick={() =>
                      setValue("theme", "dark", { shouldDirty: true })
                    }
                    label="Dark"
                  />
                  <DropdownMenuItem
                    icon={LightModeIcon}
                    onClick={() =>
                      setValue("theme", "system", { shouldDirty: true })
                    }
                    label="System"
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </Page.Vertical>
            <Page.Vertical sizing="grow" align="stretch">
              <Label>Keyboard Shortcuts</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="copy-sm flex items-center gap-2 text-foreground dark:text-foreground-night">
                    Send message:
                    <Button
                      variant="outline"
                      label={
                        submitMessageKey === "enter"
                          ? "Enter (↵)"
                          : "Cmd + Enter (⌘ + ↵)"
                      }
                      isSelect
                      className="w-fit"
                    />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() =>
                      setValue("submitMessageKey", "enter", {
                        shouldDirty: true,
                      })
                    }
                  >
                    Enter
                    <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setValue("submitMessageKey", "cmd+enter", {
                        shouldDirty: true,
                      })
                    }
                  >
                    Cmd + Enter
                    <DropdownMenuShortcut>⌘ + ↵</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Page.Vertical>
          </Page.Horizontal>
        </Page.Vertical>
      </form>

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
          form="account-settings-form"
          disabled={!formState.isDirty || formState.isSubmitting}
          loading={formState.isSubmitting}
        />
      </Page.Horizontal>
    </>
  );
}
