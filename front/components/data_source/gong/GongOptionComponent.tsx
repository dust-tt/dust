import { ContentMessage } from "@dust-tt/sparkle";

export function GongOptionComponent() {
  return (
    <div className="flex flex-col py-2">
      <ContentMessage title="All Gong data will sync automatically" size="lg">
        All your Gong resources will sync automatically. Selecting items
        individually is not available.
      </ContentMessage>
    </div>
  );
}
