import type { z } from "zod";
import { CONFIG_SCHEMA, type Config } from "@/types/config";

export const GPT_5_2_2025_12_11_MODEL_ID = "gpt-5.2-2025-12-11" as const;

export const DEFAULT_TEMPERATURE = 1;

export const GPT_5_2_2025_12_11_CONFIG_SCHEMA = CONFIG_SCHEMA;

type _Gpt5220251211Config = z.infer<typeof GPT_5_2_2025_12_11_CONFIG_SCHEMA>;

export type Gpt5220251211Config = _Gpt5220251211Config extends Config
  ? _Gpt5220251211Config
  : never;
