import { useState } from "react";

import {
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
} from "../components/PanelLayout";

const PROJECTS = ["Project 1", "Project 2", "Project 3"];
const CONVERSATIONS = ["Conversation 1", "Conversation 2", "Conversation 3"];
const FRAMES = [
  "Frame 1",
  "Frame 2",
  "CSV 1",
  "Co-Edition text 1",
  "Co-Edition text 2",
];

function NavList<T extends string>({
  items,
  selected,
  onSelect,
}: {
  items: T[];
  selected: T | null;
  onSelect: (item: T) => void;
}) {
  return (
    <div className="s-flex s-flex-col s-gap-0.5 s-overflow-auto s-p-2">
      {items.map((item) => (
        <button
          key={item}
          onClick={() => onSelect(item)}
          className={[
            "s-flex s-w-full s-items-center s-rounded-md s-px-3 s-py-2 s-text-left s-text-sm s-transition-colors",
            item === selected
              ? "s-bg-primary-100 s-font-medium s-text-primary-900 dark:s-bg-primary-900/30 dark:s-text-primary-100"
              : "s-text-foreground hover:s-bg-structure-100 dark:s-text-foreground-night dark:hover:s-bg-structure-100-night",
          ].join(" ")}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export default function Panels() {
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);

  const p3Open = selectedConversation !== null;
  const p4Open = selectedFrame !== null;

  const closeP3 = () => {
    setSelectedConversation(null);
    setSelectedFrame(null);
  };

  const closeP4 = () => setSelectedFrame(null);

  return (
    <PanelLayout>
      <PanelLayoutNav>
        <NavList
          items={PROJECTS}
          selected={selectedProject}
          onSelect={setSelectedProject}
        />
      </PanelLayoutNav>

      <PanelLayoutPanel
        label={selectedProject}
        isOpen={true}
        onClose={() => {}}
      >
        <NavList
          items={CONVERSATIONS}
          selected={selectedConversation}
          onSelect={setSelectedConversation}
        />
      </PanelLayoutPanel>

      <PanelLayoutPanel
        label={selectedConversation ?? "Conversation"}
        isOpen={p3Open}
        onClose={closeP3}
      >
        <NavList
          items={FRAMES}
          selected={selectedFrame}
          onSelect={setSelectedFrame}
        />
      </PanelLayoutPanel>

      <PanelLayoutPanel
        label={selectedFrame ?? "Co-edition"}
        isOpen={p4Open}
        onClose={closeP4}
      />
    </PanelLayout>
  );
}
