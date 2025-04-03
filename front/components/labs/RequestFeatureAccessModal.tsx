import {
  Button,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { sendRequestFeatureAccessEmail } from "@app/lib/email";
import type { LightWorkspaceType } from "@app/types";

interface RequestFeatureAccessModal {
  owner: LightWorkspaceType;
  featureName: string;
}

export function RequestFeatureAccessModal({
  owner,
  featureName,
}: RequestFeatureAccessModal) {
  const [message, setMessage] = useState("");
  const sendNotification = useSendNotification();

  const onClose = () => {
    setMessage("");
  };

  const onSave = async () => {
    try {
      await sendRequestFeatureAccessEmail({
        emailMessage: message,
        featureName,
        owner,
      });
      sendNotification({
        type: "success",
        title: "Email sent!",
        description: `Your request was sent to the Dust support team. We'll get back to you as soon as possible.`,
      });
      setMessage("");
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error sending email",
        description: "An unexpected error occurred while sending email.",
      });
    }
  };
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="Request" icon={PlusIcon} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Requesting Beta Access to {featureName}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2">
                <p className="mb-2 text-sm text-element-700">
                  {`This feature is currently in beta. If you'd like to request access, please fill out the form below.`}
                </p>
              </div>
              <TextArea
                placeholder={`Please tell us why you'd like to access ${featureName}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mb-2"
              />
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Send",
            onClick: onSave,
            disabled: message.length === 0,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
