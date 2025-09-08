import { ModelId } from "@app/types/shared/model_id";
import { EditedByUser } from "@app/types/user";

import * as t from "io-ts";

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

export type WebhookSourcesViewType = {
  id: ModelId;
  sId: string;
  name: string | null;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  webhookSource: WebhookSourceType;
  editedByUser: EditedByUser | null;
};

export const WebhookSourceSchema = t.type({
  name: t.string,
  secret: t.string,
  signatureHeader: t.string,
  signatureAlgorithm: t.union([
    t.literal("sha1"),
    t.literal("sha256"),
    t.literal("sha512"),
  ]),
  customHeaders: t.record(t.string, t.string),
});
