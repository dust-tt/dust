import React, { useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

interface BuilderLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export function BuilderLayout({ leftPanel, rightPanel }: BuilderLayoutProps) {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  const toggleRightPanel = () => {
    setIsRightPanelOpen(!isRightPanelOpen);
  };

  return (
    <div className="s-h-[800px] s-w-full">
      <div className="s-flex s-h-full s-w-full s-items-center s-gap-4 s-px-6">
        <div className="s-flex s-h-full s-grow s-justify-center">
          <div className="s-h-full s-w-full s-max-w-[700px] s-bg-slate-100">
            {leftPanel}
          </div>
        </div>
        <Button
          label="Preview"
          labelVisible={isRightPanelOpen ? false : true}
          size="md"
          variant={isRightPanelOpen ? "tertiary" : "primary"}
          icon={isRightPanelOpen ? ChevronRightIcon : ChevronLeftIcon}
          onClick={toggleRightPanel}
        />
        <div
          className={classNames(
            "s-duration-400 s-h-full s-bg-slate-100 s-transition-opacity s-ease-out",
            isRightPanelOpen ? "s-opacity-100" : "s-opacity-0"
          )}
        >
          <div
            className={classNames(
              "s-duration-800 s-overflow-hidden s-transition-all s-ease-out",
              isRightPanelOpen ? "s-w-[400px]" : "s-w-0"
            )}
          >
            <div className="s-min-w-20">{rightPanel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

BuilderLayout.defaultProps = {
  leftPanel: <>panel</>,
  rightPanel: <>preview</>,
};
