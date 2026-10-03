import React from "react";

import { KnowledgeComposer } from "../components/KnowledgeComposer";
import { PlaygroundScreen } from "../components/PlaygroundScreen";

export default function KnowledgeBrowsingStory() {
  return (
    <PlaygroundScreen>
      <div className="flex min-h-full w-full flex-col items-center gap-8 px-6 py-16">
        <div className="flex w-full max-w-2xl flex-col gap-1.5">
          <h1 className="heading-2xl text-foreground">Skill instructions</h1>
          <p className="copy-sm text-muted-foreground">
            Type <span className="font-medium text-foreground">/</span> for a
            command menu — attach knowledge, upload a file, or attach a skill —
            or click <span className="font-medium text-foreground">Insert</span>{" "}
            to drop a "/" at the cursor and open the same menu.
          </p>
        </div>
        <KnowledgeComposer />
      </div>
    </PlaygroundScreen>
  );
}
