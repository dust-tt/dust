import { Button, Input, Page, Spinner } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { UserTypeWithWorkspaces } from "@app/types";

interface AccountSettingsProps {
  user: UserTypeWithWorkspaces | null;
  isUserLoading: boolean;
  mutateUser: () => void;
}

export function AccountSettings({
  user,
  isUserLoading,
  mutateUser,
}: AccountSettingsProps) {
  const sendNotification = useSendNotification();
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName || "");
    }
  }, [user]);

  const updateUserProfile = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch("/api/user", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastName,
        }),
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
    } finally {
      setIsUpdating(false);
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
        <Page.P>eMail</Page.P>
        <Page.P variant="secondary">{user?.email}</Page.P>
      </Page.Horizontal>

      <Page.Horizontal sizing="grow">
        <Page.Vertical sizing="grow" align="stretch">
          <Input
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First Name"
          />
        </Page.Vertical>
        <Page.Vertical sizing="grow" align="stretch">
          <Input
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last Name"
          />
        </Page.Vertical>
      </Page.Horizontal>
      <Page.Horizontal align="right">
        <Button
          label="Cancel"
          variant="secondary"
          onClick={() => {
            setFirstName(user?.firstName || "");
            setLastName(user?.lastName || "");
          }}
        />
        <Button
          label="Save"
          variant="primary"
          onClick={updateUserProfile}
          disabled={isUpdating}
          loading={isUpdating}
        />
      </Page.Horizontal>
    </>
  );
}
