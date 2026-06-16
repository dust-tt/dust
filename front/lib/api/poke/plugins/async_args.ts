import type { AsyncEnumValues, EnumValues } from "@app/types/poke/plugins";

export interface PokeGetPluginAsyncArgsResponseBody {
  asyncArgs: Record<
    string,
    string | number | boolean | AsyncEnumValues | EnumValues
  >;
}
