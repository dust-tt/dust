import { ModelId } from "../../../shared/model_id";
import { DataSourceType } from "../../data_source";
import { DataSourceViewType } from "../../data_source_view";
import { GroupType } from "../../groups";
import { VaultType } from "../../vault";

export interface PokeItemBase {
  id: ModelId;
  link: string | null;
  name: string;
}

export type PokeVaultType = VaultType & {
  groups: GroupType[];
};

export type PokeDataSourceType = DataSourceType &
  PokeItemBase & {
    vault: PokeVaultType;
  };

export type PokeDataSourceViewType = DataSourceViewType &
  PokeItemBase & {
    dataSource: PokeDataSourceType;
    vault: PokeVaultType;
  };
