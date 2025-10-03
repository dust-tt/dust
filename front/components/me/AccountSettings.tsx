import { Button, Input, Label, Page, Spinner, Tooltip } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { usePatchUser } from "@app/lib/swr/user";
import type { UserTypeWithWorkspaces } from "@app/types";
interface AccountSettingsProps {
  user: UserTypeWithWorkspaces | null;
  isUserLoading: boolean;
}

const AccountSettingsSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
});

type AccountSettingsType = z.infer<typeof AccountSettingsSchema>;

export function AccountSettings({ user, isUserLoading }: AccountSettingsProps) {
  const { register, handleSubmit, reset, formState } =
    useForm<AccountSettingsType>({
      defaultValues: {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        firstName: user?.firstName || "",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        lastName: user?.lastName || "",
      },
    });

  const { patchUser } = usePatchUser();
  const isProvisioned = user?.origin === "provisioned";

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        lastName: user.lastName || "",
      });
    }
  }, [user, reset]);

  const updateUserProfile = async (data: AccountSettingsType) => {
    await patchUser(data.firstName, data.lastName, true);
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
      <Page.Horizontal>
        <Label>Email</Label>
        <Label className="text-muted-foreground dark:text-muted-foreground-night">
          {user?.email}
        </Label>
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

          {formState.isDirty && !isProvisioned && (
            <Page.Horizontal align="right">
              <Button
                label="Cancel"
                variant="ghost"
                onClick={() =>
                  reset({
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    firstName: user?.firstName || "",
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    lastName: user?.lastName || "",
                  })
                }
                type="button"
              />
              <Button
                label="Save"
                variant="primary"
                type="submit"
                disabled={formState.isSubmitting}
                loading={formState.isSubmitting}
              />
            </Page.Horizontal>
          )}
        </Page.Vertical>
      </form>
    </>
  );
}
