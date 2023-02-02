export function extractConfig(spec) {
  let c = {};
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
      case "input":
        c[spec[i].name] = {
          type: "input",
          dataset: spec[i].config ? spec[i].config.dataset : "",
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
            ? spec[i].config.errors_as_output
              ? spec[i].config.errors_as_output
              : false
            : false,
        };
        break;
    }
  }
  return c;
}
