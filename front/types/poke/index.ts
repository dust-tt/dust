import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "../assistant/conversation";
import type { ContentFragmentType } from "../content_fragment";
import type { DataSourceType } from "../data_source";
import type { DataSourceViewType } from "../data_source_view";
import type { GroupType } from "../groups";
import type { ModelId } from "../shared/model_id";
import type { SpaceType } from "../space";

export interface PokeItemBase {
  id: ModelId;
  link: string | null;
  name: string;
}

export type PokeSpaceType = SpaceType & {
  id: ModelId;
  groups: GroupType[];
};

export type PokeDataSourceType = DataSourceType &
  PokeItemBase & {
    space: PokeSpaceType;
  };

export type PokeDataSourceViewType = DataSourceViewType &
  PokeItemBase & {
    dataSource: PokeDataSourceType;
    space: PokeSpaceType;
  };

type PokeAgentActionType = AgentMessageType["actions"][0] & {
  runId?: string | null;
  appWorkspaceId?: string | null;
  appSpaceId?: string | null;
  appId?: string | null;
};

export type PokeAgentMessageType = Omit<AgentMessageType, "actions"> & {
  runIds?: string[] | null;
  actions: PokeAgentActionType[];
};

export type PokeConversationType = Omit<ConversationType, "content"> & {
  content: (
    | UserMessageType[]
    | PokeAgentMessageType[]
    | ContentFragmentType[]
  )[];
};
