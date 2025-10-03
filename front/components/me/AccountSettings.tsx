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
  PencilSquareIcon,
  Spinner,
  SunIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

import { FormProvider } from "@app/components/sparkle/FormProvider";
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

  const { patchUser } = usePatchUser();
  const isProvisioned = user?.origin === "provisioned";

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "avatar",
  });

  const form = useForm<AccountSettingsType>({
    resolver: zodResolver(AccountSettingsSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
      theme: currentTheme ?? "system",
      submitMessageKey: "enter",
    },
  });

  const { field: profilePictureField } = useController({
    name: "profilePictureUrl",
    control: form.control,
  });
  const { field: themeField } = useController({
    name: "theme",
    control: form.control,
  });
  const { field: submitKeyField } = useController({
    name: "submitMessageKey",
    control: form.control,
  });
  const currentImageUrl = profilePictureField.value ?? ANONYMOUS_USER_IMAGE_URL;

  useEffect(() => {
    const storedKey =
      (typeof window !== "undefined" &&
        localStorage.getItem("submitMessageKey")) ??
      null;

    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        profilePictureUrl: user.image ?? null,
        theme: currentTheme ?? "system",
        submitMessageKey:
          storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
      });
    } else {
      // Ensure preferences fields are initialized even without user
      form.setValue("theme", currentTheme ?? "system", { shouldDirty: false });
      form.setValue(
        "submitMessageKey",
        storedKey && isSubmitMessageKey(storedKey) ? storedKey : "enter",
        { shouldDirty: false }
      );
    }
  }, [user, form, currentTheme]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingImage(true);
    const files = await fileUploaderService.handleFilesUpload([file]);
    setIsUploadingImage(false);

    if (files && files.length > 0 && files[0].publicUrl) {
      profilePictureField.onChange(files[0].publicUrl);
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

    form.reset({
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
        {...form.register(fieldName)}
        placeholder={label}
        disabled={isProvisioned}
        isError={!!form.formState.errors[fieldName]}
        message={form.formState.errors[fieldName]?.message}
        messageStatus={form.formState.errors[fieldName] ? "error" : undefined}
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
    <FormProvider form={form} onSubmit={updateUserProfile}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleImageUpload}
      />
      <div className="flex items-center gap-4 py-2">
        <div className="group relative">
          <Avatar size="lg" visual={currentImageUrl ?? null} />
          <Button
            variant="outline"
            size="sm"
            icon={PencilSquareIcon}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            disabled={isUploadingImage}
            loading={isUploadingImage}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            {renderNameInput({ label: "First Name", fieldName: "firstName" })}
          </div>
          <div className="flex-1">
            {renderNameInput({ label: "Last Name", fieldName: "lastName" })}
          </div>
        </div>

        <div className="flex items-center gap-2 py-2">
          <Label>Email</Label>
          <span className="text-muted-foreground dark:text-muted-foreground-night">
            {user?.email}
          </span>
        </div>

        <div className="flex w-full flex-row justify-between gap-4">
          <div className="flex-1">
            <div>
              <Label>Theme</Label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  icon={
                    themeField.value === "light"
                      ? SunIcon
                      : themeField.value === "dark"
                        ? MoonIcon
                        : LightModeIcon
                  }
                  label={
                    themeField.value === "light"
                      ? "Light"
                      : themeField.value === "dark"
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
                  onClick={() => themeField.onChange("light")}
                  label="Light"
                />
                <DropdownMenuItem
                  icon={MoonIcon}
                  onClick={() => themeField.onChange("dark")}
                  label="Dark"
                />
                <DropdownMenuItem
                  icon={LightModeIcon}
                  onClick={() => themeField.onChange("system")}
                  label="System"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex-1">
            <Label>Keyboard Shortcuts</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="copy-sm flex items-center gap-2 text-foreground dark:text-foreground-night">
                  Send message:
                  <Button
                    variant="outline"
                    label={
                      submitKeyField.value === "enter"
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
                  onClick={() => submitKeyField.onChange("enter")}
                >
                  Enter
                  <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => submitKeyField.onChange("cmd+enter")}
                >
                  Cmd + Enter
                  <DropdownMenuShortcut>⌘ + ↵</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            label="Cancel"
            variant="ghost"
            onClick={handleCancel}
            type="button"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
          />
          <Button
            label="Save"
            variant="primary"
            type="submit"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          />
        </div>
      </div>
    </FormProvider>
  );
}
