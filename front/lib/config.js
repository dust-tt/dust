export function extractConfig(spec) {
  let c = {};
  for (var i = 0; i < spec.length; i++) {
    switch (spec[i].type) {
      case "llm":
        c[spec[i].name] = {
          type: "llm",
          provider_id: spec[i].config ? spec[i].config.provider_id : "",
          model_id: spec[i].config ? spec[i].config.model_id : "",
        };
        break;
      case "root":
        c[spec[i].name] = {
          type: "root",
          dataset: spec[i].config ? spec[i].config.dataset : "",
        };
        break;
    }
  }
  return c;
}
