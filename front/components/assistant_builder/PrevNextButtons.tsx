import { Button } from "@dust-tt/sparkle";
import React from "react";

import type { BuilderScreen } from "@app/components/assistant_builder/types";

interface PrevNextButtonsProps {
  screen: BuilderScreen;
  setScreen: (screen: BuilderScreen) => void;
  setCurrentTab: (tab: string) => void;
}

export function PrevNextButtons({
  screen,
  setScreen,
  setCurrentTab,
}: PrevNextButtonsProps) {
  return (
    <div className="flex py-6">
      {screen !== "instructions" && (
        <Button
          label="Previous"
          size="md"
          variant="primary"
          data-gtm-label="prevButton"
          data-gtm-location="assistantBuilder"
          onClick={() => {
            const newScreen = screen === "actions" ? "instructions" : "actions";
            setScreen(newScreen);
            setCurrentTab(newScreen);
          }}
        />
      )}
      <div className="flex-grow" />
      {screen !== "settings" && (
        <Button
          label="Next"
          size="md"
          variant="primary"
          data-gtm-label="nextButton"
          data-gtm-location="assistantBuilder"
          onClick={() => {
            const newScreen =
              screen === "instructions" ? "actions" : "settings";
            setScreen(newScreen);
            setCurrentTab(newScreen);
          }}
        />
      )}
    </div>
  );
}
