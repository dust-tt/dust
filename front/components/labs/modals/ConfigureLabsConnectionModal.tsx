import {
  Button,
  Cog6ToothIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";

import type { LabsConnectionItemType, LightWorkspaceType } from "@app/types";

interface ConfigureLabsConnectionModal {
  owner: LightWorkspaceType;
  connection: LabsConnectionItemType;
}

export function ConfigureLabsConnectionModal({
  owner,
  connection,
}: ConfigureLabsConnectionModal) {
  const onSave = async () => {
    console.log("save");
  };

  const onClose = () => {
    console.log("close");
  };
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="Connect" icon={Cog6ToothIcon} variant="outline" />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Beta connection: {connection.label}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-element-700 mb-2 text-sm">
                    {`This feature is currently in beta. We would love to hear from you once you test it out!`}
                  </p>
                </div>
              </>
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
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
