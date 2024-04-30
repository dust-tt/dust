import { ModelId } from "../shared/model_id";

export type KeyType = {
  id: ModelId
  createdAt: number;
  creator: string | null;
  secret: string;
  status: string;
  name: string | null;
};
