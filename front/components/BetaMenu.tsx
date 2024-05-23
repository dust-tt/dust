import { Avatar, BookOpenIcon, DropdownMenu } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

import { isDevelopmentOrDustWorkspace } from "@app/lib/development";

export function BetaMenu({ owner }: { owner: WorkspaceType }) {
  const hasBetaAccess =
    owner.flags?.some((flag: string) => flag.startsWith("labs_")) ||
    isDevelopmentOrDustWorkspace(owner);

  return (
    <DropdownMenu>
      <DropdownMenu.Button className="mr-2 flex rounded-full bg-gray-800 text-sm focus:outline-none">
        <span className="sr-only">Open beta menu</span>
        <Avatar
          size="md"
          visual={"/static/labs/beta.png"}
          onClick={() => {
            "clickable";
          }}
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topRight" width={220}>
        {hasBetaAccess && (
          <>
            {(owner.flags.includes("labs_transcripts") ||
              isDevelopmentOrDustWorkspace(owner)) && (
              <DropdownMenu.Item
                label="Transcripts processing"
                href={`/w/${owner.sId}/assistant/labs/transcripts`}
                icon={BookOpenIcon}
              />
            )}
          </>
        )}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
