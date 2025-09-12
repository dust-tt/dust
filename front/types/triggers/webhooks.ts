import { z } from "zod";

import type { ModelId } from "@app/types/shared/model_id";
import type { EditedByUser } from "@app/types/user";

export type WebhookSourceType = {
  id: ModelId;
  sId: string;
  name: string;
  secret: string | null;
  signatureHeader: string | null;
  signatureAlgorithm: "sha1" | "sha256" | "sha512" | null;
  customHeaders: Record<string, string> | null;
  createdAt: number;
  updatedAt: number;
};

export type WebhookSourceViewType = {
  id: ModelId;
  sId: string;
  customName: string | null;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  webhookSource: WebhookSourceType;
  editedByUser: EditedByUser | null;
};

export type WebhookSourceWithViews = WebhookSourceType & {
  views: WebhookSourceViewType[];
};

