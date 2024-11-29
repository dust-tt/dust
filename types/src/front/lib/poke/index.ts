import { ModelId } from "../../../shared/model_id";
import {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "../../assistant/conversation";
import { ContentFragmentType } from "../../content_fragment";
import { DataSourceType } from "../../data_source";
import { DataSourceViewType } from "../../data_source_view";
import { GroupType } from "../../groups";
import { SpaceType } from "../../space";

export interface PokeItemBase {
  id: ModelId;
  link: string | null;
  name: string;
}

export type PokeSpaceType = SpaceType & {
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
