import { ModelId } from "../../../shared/model_id";
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
