import { Button, Input, Label, Page, Spinner } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { UserTypeWithWorkspaces } from "@app/types";
interface AccountSettingsProps {
  user: UserTypeWithWorkspaces | null;
  isUserLoading: boolean;
  mutateUser: () => void;
}

const AccountSettingsSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
});

type AccountSettingsType = z.infer<typeof AccountSettingsSchema>;

export function AccountSettings({
  user,
  isUserLoading,
  mutateUser,
}: AccountSettingsProps) {
  const sendNotification = useSendNotification();
  const { register, handleSubmit, reset, formState } =
    useForm<AccountSettingsType>({
      defaultValues: {
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
      },
    });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName || "",
      });
    }
  }, [user, reset]);

  const updateUserProfile = async (data: AccountSettingsType) => {
    try {
      const response = await fetch("/api/user", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        sendNotification({
          title: "Success!",
          description: "Your profile has been updated.",
          type: "success",
        });
        mutateUser();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to update profile");
      }
    } catch (error) {
      sendNotification({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update profile",
        type: "error",
      });
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Page.Horizontal>
        <Label>eMail</Label>
        <Label className="text-muted-foreground dark:text-muted-foreground-night">
          {user?.email}
        </Label>
      </Page.Horizontal>

      <form onSubmit={handleSubmit(updateUserProfile)}>
        <Page.Vertical sizing="grow" align="stretch">
          <Page.Horizontal sizing="grow">
            <Page.Vertical sizing="grow" align="stretch">
              <Input
                label="First Name"
                {...register("firstName")}
                placeholder="First Name"
              />
            </Page.Vertical>
            <Page.Vertical sizing="grow" align="stretch">
              <Input
                label="Last Name"
                {...register("lastName")}
                placeholder="Last Name"
              />
            </Page.Vertical>
          </Page.Horizontal>

          {formState.isDirty && (
            <Page.Horizontal align="right">
              <Button
                label="Cancel"
                variant="ghost"
                onClick={() =>
                  reset({
                    firstName: user?.firstName || "",
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
