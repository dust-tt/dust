import type { PokeSpaceType } from "@app/types/poke";
import type { PodMetadataType } from "@app/types/project_metadata";
import type { EnrichedSpaceType } from "@app/types/space";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeListSpaces = {
  spaces: EnrichedSpaceType[];
};

export type PokeGetSpaceDetails = {
  members: Record<string, UserTypeWithWorkspaces[]>;
  metadata: PodMetadataType | null;
  space: PokeSpaceType;
};
