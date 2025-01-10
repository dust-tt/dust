import {
  Dialog,
  Icon,
  RadioGroup,
  RadioGroupChoice,
  Separator,
} from "@dust-tt/sparkle";
import type { SpaceType } from "@dust-tt/types";
import React, { useState } from "react";

import {
  getSpaceIcon,
  getSpaceName,
  groupSpacesForDisplay,
} from "@app/lib/spaces";
import { classNames } from "@app/lib/utils";

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
                <RadioGroupChoice
                  value={space.sId}
                  disabled={isDisabled}
                  iconPosition="start"
                  className={
                    // needs to be handled manually because of the separator
                    classNames(
                      index === 0 ? "pt-2" : "",
                      index === sortedSpaces.length - 1 ? "pb-2" : ""
                    )
                  }
                  onClick={() => {
                    if (isDisabled) {
                      setAlertIsDialogOpen(true);
                    }
                  }}
                  label={
                    <div className={"flex items-center gap-1 pl-2"}>
                      <Icon
                        visual={getSpaceIcon(space)}
                        size="md"
                        className={classNames(
                          "inline-block flex-shrink-0 align-middle",
                          isDisabled ? "text-element-700" : ""
                        )}
                      />
                      <span
                        className={classNames(
                          "font-bold",
                          "align-middle",
                          isDisabled ? "text-element-700" : "text-foreground"
                        )}
                      >
                        {getSpaceName(space)}
                      </span>
                    </div>
                  }
                >
                  <div className="flex flex-col">
                    {selectedSpace === space.sId && (
                      <div className="ml-4 mt-1">
                        {renderChildren(selectedSpaceObj)}
                      </div>
                    )}
                  </div>
                </RadioGroupChoice>
              </div>
            </React.Fragment>
          );
        })}
      </RadioGroup>
      <Separator />
      <Dialog
        alertDialog={true}
        isOpen={isAlertDialogOpen}
        onValidate={() => setAlertIsDialogOpen(false)}
        title="Changing source selection"
      >
        An assistant can access one source of data only. The other tools are
        using a different source.
      </Dialog>
    </>
  );
}
