export function updateConfig(config, spec) {
  let c = {};
  config = config ? config : {};

  for (var i = 0; i < spec.length; i++) {
    switch (spec[i].type) {
      case "llm":
        c[spec[i].name] = {
          type: "llm",
          provider_id: config[spec[i].name]
            ? config[spec[i].name].provider_id
            : "",
          model_id: config[spec[i].name] ? config[spec[i].name].model_id : "",
        };
        break;
      case "root":
        c[spec[i].name] = {
          type: "root",
          dataset: config[spec[i].name] ? config[spec[i].name].dataset : "",
        };
        break;
    }
  }

  return c;
}
