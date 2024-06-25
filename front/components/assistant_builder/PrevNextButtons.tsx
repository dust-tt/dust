import { Button } from "@dust-tt/sparkle";
import React from "react";

import type { BuilderScreen } from "@app/components/assistant_builder/types";

export function PrevNextButtons({
  screen,
  setScreen,
}: {
  screen: BuilderScreen;
  setScreen: (screen: BuilderScreen) => void;
}) {
  return (
    <div className="flex py-6">
      {screen !== "instructions" && (
        <Button
          label="Previous"
          size="md"
          variant="secondary"
          onClick={() => {
            if (screen === "actions") {
              setScreen("instructions");
            } else if (screen === "naming") {
              setScreen("actions");
            }
          }}
        />
      )}
      <div className="flex-grow" />
      {screen !== "naming" && (
        <Button
          label="Next"
          size="md"
          variant="primary"
          onClick={() => {
            if (screen === "instructions") {
              setScreen("actions");
            } else if (screen === "actions") {
              setScreen("naming");
            }
          }}
        />
      )}
    </div>
  );
}
