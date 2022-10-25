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
        };
        break;
      case "replit":
        c[spec[i].name] = {
          type: "replit",
          repl: spec[i].spec ? spec[i].spec.repl : "",
          replit_user: spec[i].spec ? spec[i].spec.replit_user : "",
        };
        break;
    }
  }
  return c;
}
