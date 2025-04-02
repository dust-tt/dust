import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import {
  CodeBlock,
  Icon,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@sparkle/components";
import { SamsCommand } from "@sparkle/components/SamsCommandPalette";
import { useCommandPalette } from "@sparkle/hooks/useCommandPalette";
import { FolderIcon } from "@sparkle/icons";

import { AppCommandPalette } from "../components/AppCommandPalette";
import { Command } from "../contexts/CommandPaletteContext";

const meta = {
  title: "Primitives/Sam's CommandPalette",
  component: SamsCommand,
} satisfies Meta<typeof SamsCommand>;

export default meta;

export function SimpleExample() {
  return (
    <AppCommandPalette>
      <Label>
        Press <CodeBlock inline>⌘ K</CodeBlock> to open the command palette
      </Label>
      <SamsCommand />
    </AppCommandPalette>
  );
}

// Example with entity-specific commands
export function EntitySpecificCommands() {
  return (
    <AppCommandPalette>
      <EntitySelector />
    </AppCommandPalette>
  );
}

// Predefined entity commands - moved outside component to avoid recreation
const entity1Commands: Command[] = [
  {
    id: "entity1.actionA",
    label: "Action A",
    category: "Entity 1",
    entityType: "entity1",
    action: () => {
      window.alert("Executing Action A for Entity 1");
    },
    priority: 0,
  },
  {
    id: "entity1.actionB",
    label: "Action B",
    category: "Entity 1",
    entityType: "entity1",
    action: () => {
      window.alert("Executing Action B for Entity 1");
    },
    priority: 1,
  },
];

const entity2Commands: Command[] = [
  {
    id: "entity2.actionC.warning",
    label: "Action C",
    category: "Entity 2",
    entityType: "entity2",
    action: () => {
      window.alert("Executing Action C for Entity 2");
    },
    priority: 0,
  },
  {
    id: "entity2.actionD",
    label: "Action D",
    icon: <Icon visual={FolderIcon} />,
    category: "Entity 2",
    entityType: "entity2",
    action: () => {
      window.alert("Executing Action D for Entity 2");
    },
    priority: 1,
  },
];
// Component to demonstrate entity selection and entity-specific commands
function EntitySelector() {
  const { registerCommands, unregisterCommandsByEntityType } =
    useCommandPalette();
  const [currentEntity, setCurrentEntity] = useState<"entity1" | "entity2">();

  // Default to entity 1 commands

  function handleEntityChange(newEntity: "entity1" | "entity2") {
    setCurrentEntity((previous) => {
      if (previous) {
        unregisterCommandsByEntityType(previous);
      }
      registerCommands(
        newEntity === "entity1" ? entity1Commands : entity2Commands
      );
      return newEntity;
    });
  }

  return (
    <div className="s-flex s-flex-col s-gap-4">
      <div className="s-flex s-flex-col s-gap-2">
        <Label>Current Entity</Label>
        <div className="s-flex s-gap-4">
          <RadioGroup value={currentEntity} onValueChange={handleEntityChange}>
            <RadioGroupItem value="entity1" label="Entity 1" />
            <RadioGroupItem value="entity2" label="Entity 2" />
          </RadioGroup>
        </div>
      </div>

      <div className="s-flex s-flex-col s-gap-2">
        <Label>Command Palette</Label>
        <p className="s-text-sm s-text-muted-foreground">
          Press <CodeBlock inline>⌘ K</CodeBlock> to open the command palette.
          The commands change based on the selected entity.
        </p>
      </div>
    </div>
  );
}
