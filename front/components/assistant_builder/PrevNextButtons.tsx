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
          variant="highlight"
          onClick={() => {
            const newScreen = screen === "actions" ? "instructions" : "actions";
            setScreen(newScreen);
            setCurrentTab(newScreen);
          }}
        />
      )}
      <div className="flex-grow" />
      {screen !== "naming" && (
        <Button
          label="Next"
          size="md"
          variant="highlight"
          onClick={() => {
            const newScreen = screen === "instructions" ? "actions" : "naming";
            setScreen(newScreen);
            setCurrentTab(newScreen);
          }}
        />
      )}
    </div>
  );
}
