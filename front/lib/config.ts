import type { BlockRunConfig, SpecificationType } from "@dust-tt/types";

export function extractConfig(spec: SpecificationType): BlockRunConfig {
  const c = {} as { [key: string]: any };
  for (let i = 0; i < spec.length; i++) {
    const type = spec[i].type;
    switch (type) {
      case "llm":
        c[spec[i].name] = {
          type: "llm",
          provider_id: spec[i].config.provider_id || "",
          model_id: spec[i].config.model_id || "",
          use_cache: spec[i].config.use_cache
            ? spec[i].config.use_cache
            : false,
        };
        break;
      case "chat":
        c[spec[i].name] = {
          type: "chat",
          provider_id: spec[i].config.provider_id || "",
          model_id: spec[i].config.model_id || "",
          function_call: spec[i].config.function_call
            ? spec[i].config.function_call
            : null,
          use_cache: spec[i].config.use_cache
            ? spec[i].config.use_cache
            : false,
        };
        break;
      case "input":
        c[spec[i].name] = {
          type: "input",
          dataset: spec[i].config.dataset || "",
        };
        break;
      case "data_source":
        const top_k = parseInt(spec[i].config.top_k || "");
        c[spec[i].name] = {
          type: "data_source",
          data_sources: spec[i].config.data_sources || [],
          top_k: isNaN(top_k) ? 8 : top_k,
          filter: spec[i].config.filter || null,
          use_cache: spec[i].config.use_cache
            ? spec[i].config.use_cache
            : false,
        };
        break;
      case "search":
        c[spec[i].name] = {
          type: "search",
          provider_id: spec[i].config.provider_id || "",
          use_cache: spec[i].config.use_cache
            ? spec[i].config.use_cache
            : false,
        };
        break;
      case "curl":
        c[spec[i].name] = {
          type: "curl",
          use_cache: spec[i].config.use_cache
            ? spec[i].config.use_cache
            : false,
        };
        break;
      case "browser":
        c[spec[i].name] = {
          type: "browser",
          provider_id: spec[i].config.provider_id || "",
          use_cache: spec[i].config.use_cache
            ? spec[i].config.use_cache
            : false,
          error_as_output: spec[i].config.error_as_output
            ? spec[i].config.error_as_output
            : false,
        };
        break;
      case "database_schema":
        c[spec[i].name] = {
          type: "database_schema",
          tables: spec[i].config?.tables,
        };
        break;
      case "database":
        c[spec[i].name] = {
          type: "database",
          tables: spec[i].config?.tables,
        };
        break;
      case "data":
      case "code":
      case "map":
      case "reduce":
      case "while":
      case "end":
        // these blocks have no config
        break;

      default:
        ((t: never) => {
          console.warn(`Unknown block type: ${t}`);
        })(type);
    }
  }
  return c;
}
