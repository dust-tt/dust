import { isModelStreamId } from "@app/types/assistant/models/auto";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  WhitelistableModelMakerIdType,
} from "@app/types/assistant/models/types";

export type ModelIdentifier = Pick<
  ModelConfigurationType,
  "providerId" | "modelId"
>;

const modelKey = ({ providerId, modelId }: ModelIdentifier) =>
  `${providerId}/${modelId}`;

const SUPPORTED_MODEL_CONFIGS_BY_KEY = new Map(
  SUPPORTED_MODEL_CONFIGS.map((config) => [modelKey(config), config])
);

// Canonical way to check if a lab is whitelisted.
// Handle the special case of the routing sentinels (auto, auto_fast, auto_complex),
// which route to a concrete (whitelisted) model at message-send time.
export function isProviderWhitelisted(
  whitelistedProviders: ReadonlySet<ModelMakerIdType>,
  providerId: WhitelistableModelMakerIdType
): boolean {
  return isModelStreamId(providerId) || whitelistedProviders.has(providerId);
}

/**
 * @cc [owner:pmilliotte,label:security;product] model-gated-on-its-lab
 * A model MUST be whitelisted iff its lab (`getModelMaker` of its entry in
 * `SUPPORTED_MODEL_CONFIGS`) is in `whitelistedProviders`, whichever host serves it.
 * A model absent from `SUPPORTED_MODEL_CONFIGS` is gated on its `providerId`.
 * Routing sentinels (auto, auto_fast, auto_complex) are always whitelisted.
 */
export function isModelWhitelisted(
  whitelistedProviders: ReadonlySet<ModelMakerIdType>,
  model: ModelIdentifier
): boolean {
  const config = SUPPORTED_MODEL_CONFIGS_BY_KEY.get(modelKey(model));
  const maker = config ? getModelMaker(config) : model.providerId;
  return isModelStreamId(maker) || whitelistedProviders.has(maker);
}
