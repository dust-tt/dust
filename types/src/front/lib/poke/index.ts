import { ModelId } from "../../../shared/model_id";

export interface PokeItemBase {
  id: ModelId;
  link: string | null;
  name: string;
}
