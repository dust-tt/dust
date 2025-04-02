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
import * as _ from "lodash";
import { useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { LightWorkspaceType } from "@app/types";

interface RequestFeatureAccessModal {
  owner: LightWorkspaceType;
  featureName: string;
}

export function RequestFeatureAccessModal({
  owner,
  featureName,
}: RequestFeatureAccessModal) {
  const { isDark } = useTheme();

  const [message, setMessage] = useState("");
  const sendNotification = useSendNotification();

  const onClose = () => {
    setMessage("");
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
            onClick: () => alert(owner.sId),
            disabled: message.length === 0,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
