import {
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Label,
  RadioGroup,
  RadioGroupCustomItem,
  Separator,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import {
  getSpaceIcon,
  getSpaceName,
  groupSpacesForDisplay,
} from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

interface SpaceSelectorProps {
  allowedSpaces?: SpaceType[];
  defaultSpace: string | undefined;
  spaces: SpaceType[];
  renderChildren: (space?: SpaceType) => React.ReactNode;
}
export function SpaceSelector({
  allowedSpaces,
  defaultSpace,
  renderChildren,
  spaces,
}: SpaceSelectorProps) {
  const [selectedSpace, setSelectedSpace] = useState<string | undefined>(
    defaultSpace
  );
  const [isAlertDialogOpen, setAlertIsDialogOpen] = useState(false);

  const shouldRenderDirectly = spaces.length === 1;
  const selectedSpaceObj = spaces.find((s) => s.sId === selectedSpace);

  if (shouldRenderDirectly) {
    if (allowedSpaces && !allowedSpaces.some((v) => v.sId === spaces[0].sId)) {
      return renderChildren(undefined);
    }
    return renderChildren(spaces[0]);
  }

  // Group by kind and sort.
  const sortedSpaces = groupSpacesForDisplay(spaces)
    .filter((i) => i.section !== "system")
    .map((i) =>
      i.spaces.sort((a, b) => {
        return a.name.localeCompare(b.name);
      })
    )
    .flat();

  return (
    <>
      <RadioGroup
        value={selectedSpace}
        onValueChange={(value) => setSelectedSpace(value)}
      >
        {sortedSpaces.map((space, index) => {
          const isDisabled =
            allowedSpaces && !allowedSpaces.some((v) => v.sId === space.sId);

          return (
            <React.Fragment key={space.sId}>
              {index > 0 && <Separator />}
              <div key={space.sId} className="py-1">
                <RadioGroupCustomItem
                  value={space.sId}
                  disabled={isDisabled}
                  id={`${index}`}
                  iconPosition="start"
                  className={
                    // needs to be handled manually because of the separator
                    cn(
                      index === 0 ? "mt-1" : "",
                      index === sortedSpaces.length - 1 ? "mb-0" : ""
                    )
                  }
                  onClick={() => {
                    if (isDisabled) {
                      setAlertIsDialogOpen(true);
                    }
                  }}
                  customItem={
                    <div className="flex items-center gap-1 pl-2">
                      <Icon
                        visual={getSpaceIcon(space)}
                        size="md"
                        className={cn(
                          "inline-block flex-shrink-0 align-middle",
                          isDisabled
                            ? "text-muted-foreground dark:text-muted-foreground-night"
                            : ""
                        )}
                      />
                      <Label
                        htmlFor={`${index}`}
                        className={cn(
                          "font-bold",
                          "align-middle",
                          isDisabled
                            ? "text-muted-foreground dark:text-muted-foreground-night"
                            : "text-foreground dark:text-foreground-night"
                        )}
                      >
                        {getSpaceName(space)}
                      </Label>
                    </div>
                  }
                >
                  <div className="mt-4 flex w-full flex-col">
                    {selectedSpace === space.sId && (
                      <div className="ml-4 mt-1">
                        {renderChildren(selectedSpaceObj)}
                      </div>
                    )}
                  </div>
                </RadioGroupCustomItem>
              </div>
            </React.Fragment>
          );
        })}
      </RadioGroup>
      <Dialog
        open={isAlertDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAlertIsDialogOpen(false);
          }
        }}
      >
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Changing source selection</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            An agent can access one source of data only. The other tools are
            using a different source.
          </DialogContainer>
          <DialogFooter
            rightButtonProps={{
              label: "Ok",
              variant: "outline",
              onClick: () => setAlertIsDialogOpen(false),
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
