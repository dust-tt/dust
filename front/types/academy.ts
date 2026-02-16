import type { ModelId } from "@app/types/shared/model_id";

export type AcademyIdentifier =
  | { userId: ModelId; browserId?: undefined }
  | { userId?: undefined; browserId: string };
