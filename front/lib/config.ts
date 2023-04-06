import { SpecificationType } from "@app/types/app";

export function extractConfig(spec: SpecificationType): { [key: string]: any } {
  let c = {} as { [key: string]: any };
  for (var i = 0; i < spec.length; i++) {
    switch (spec[i].type) {
      case "llm":
        c[spec[i].name] = {
          type: "llm",
          provider_id: spec[i].config ? spec[i].config.provider_id : "",
          model_id: spec[i].config ? spec[i].config.model_id : "",
          use_cache: spec[i].config
            ? spec[i].config.use_cache
              ? spec[i].config.use_cache
              : false
            : false,
        };
        break;
      case "chat":
        c[spec[i].name] = {
          type: "chat",
          provider_id: spec[i].config ? spec[i].config.provider_id : "",
          model_id: spec[i].config ? spec[i].config.model_id : "",
          use_cache: spec[i].config
            ? spec[i].config.use_cache
              ? spec[i].config.use_cache
              : false
            : false,
        };
        break;
      case "input":
        c[spec[i].name] = {
          type: "input",
          dataset: spec[i].config ? spec[i].config.dataset : "",
        };
        break;
      case "data_source":
        let top_k = parseInt(spec[i].config ? spec[i].config.top_k : "");
        c[spec[i].name] = {
          type: "data_source",
          data_sources: spec[i].config ? spec[i].config.data_sources : [],
          top_k: isNaN(top_k) ? 8 : top_k,
          filter: spec[i].config ? spec[i].config.filter : null,
          use_cache: spec[i].config
            ? spec[i].config.use_cache
              ? spec[i].config.use_cache
              : false
            : false,
        };
        break;
      case "search":
        c[spec[i].name] = {
          type: "search",
          provider_id: spec[i].config ? spec[i].config.provider_id : "",
          use_cache: spec[i].config
            ? spec[i].config.use_cache
              ? spec[i].config.use_cache
              : false
            : false,
        };
        break;
      case "curl":
        c[spec[i].name] = {
          type: "curl",
          use_cache: spec[i].config
            ? spec[i].config.use_cache
              ? spec[i].config.use_cache
              : false
            : false,
        };
        break;
      case "browser":
        c[spec[i].name] = {
          type: "browser",
          provider_id: spec[i].config ? spec[i].config.provider_id : "",
          use_cache: spec[i].config
            ? spec[i].config.use_cache
              ? spec[i].config.use_cache
              : false
            : false,
          error_as_output: spec[i].config
            ? spec[i].config.error_as_output
              ? spec[i].config.error_as_output
              : false
            : false,
        };
        break;
    }
  }
  return c;
}
