const recomputeIndents = (spec) => {
  var indent = 0;
  for (var i = 0; i < spec.length; i++) {
    switch (spec[i].type) {
      case "map":
        spec[i].indent = indent;
        indent++;
        break;
      case "reduce":
        indent--;
        spec[i].indent = indent;
        break;
      default:
        spec[i].indent = indent;
        break;
    }
  }
  return spec;
};

export function getNextName(spec, name) {
  let suffix = 0;
  let n = name;
  spec.forEach((b) => {
    if (suffix > 0) {
      n = `${name}_${suffix}`;
    }
    if (b.name == n) {
      suffix += 1;
      n = `${name}_${suffix}`;
    }
  });
  return n;
}

export function addBlock(spec, blockType) {
  let s = spec.map((b) => b);
  switch (blockType) {
    case "input":
      s.push({
        type: "input",
        name: "INPUT",
        indent: 0,
        spec: {},
        config: {
          dataset: "",
        },
      });
      break;
    case "map_reduce":
      s.push({
        type: "map",
        name: getNextName(spec, "LOOP"),
        indent: 0,
        spec: {
          from: "INPUT",
          repeat: "",
        },
        config: {},
      });
      s.push({
        type: "reduce",
        name: getNextName(spec, "LOOP"),
        indent: 0,
        spec: {},
        config: {},
      });
      break;
    case "data":
      s.push({
        type: "data",
        name: getNextName(spec, "EXAMPLES"),
        indent: 0,
        spec: {},
        config: {},
      });
      break;
    case "search":
      s.push({
        type: "search",
        name: getNextName(spec, "SEARCH"),
        indent: 0,
        spec: {
          query: "",
        },
        config: {
          provider_id: "",
        },
      });
      break;
    case "curl":
      s.push({
        type: "curl",
        name: "",
        indent: 0,
        spec: {
          method: "POST",
          url: "",
          headers_code:
            '_fun = (env) => {\n  return {"Content-Type": "application/json"};\n}',
          body_code: "_fun = (env) => {\n  // return a string or null to skip sending a body.\n  return JSON.stringify({ foo: \"bar\" });\n}",
        },
        config: {},
      });
      break;
    case "llm":
      s.push({
        type: "llm",
        name: getNextName(spec, "MODEL"),
        indent: 0,
        spec: {
          temperature: 0.7,
          max_tokens: 64,
          few_shot_preprompt: "",
          few_shot_count: 0,
          few_shot_prompt: "",
          prompt: "",
          stop: [],
        },
        config: {
          provider_id: "",
          model_id: "",
        },
      });
      break;
    case "code":
      s.push({
        type: "code",
        name: "",
        indent: 0,
        spec: {
          code: "_fun = (env) => {\n  // `env.state.BLOCK_NAME` constains BLOCK_NAME output.\n}",
        },
        config: {},
      });
      break;
    default:
      s.push({
        type: blockType,
        name: "",
        indent: 0,
        spec: {},
        config: {},
      });
  }
  return recomputeIndents(s);
}

export function deleteBlock(spec, index) {
  let s = spec.map((b) => b);
  if (index > -1 && index < spec.length) {
    switch (s[index].type) {
      case "map":
        s.splice(index, 1);
        for (var i = index; i < s.length; i++) {
          if (s[i].type == "reduce") {
            s.splice(i, 1);
            break;
          }
        }
        break;
      case "reduce":
        s.splice(index, 1);
        for (var i = index - 1; i >= 0; i--) {
          if (s[i].type == "map") {
            s.splice(i, 1);
            break;
          }
        }
        break;
      default:
        s.splice(index, 1);
    }
  }
  return recomputeIndents(s);
}

export function moveBlockUp(spec, index) {
  let s = spec.map((b) => b);
  if (index > 0 && index < spec.length) {
    switch (s[index].type) {
      case "map":
      case "reduce":
        if (["map", "reduce"].includes(s[index - 1].type)) {
          break;
        }
      default:
        let tmp = s[index - 1];
        s[index - 1] = s[index];
        s[index] = tmp;
        break;
    }
  }
  return recomputeIndents(s);
}

export function moveBlockDown(spec, index) {
  let s = spec.map((b) => b);
  if (index > -1 && index < spec.length - 1) {
    switch (s[index].type) {
      case "map":
      case "reduce":
        if (["map", "reduce"].includes(s[index + 1].type)) {
          break;
        }
      default:
        let tmp = s[index + 1];
        s[index + 1] = s[index];
        s[index] = tmp;
    }
  }
  return recomputeIndents(s);
}

export function dumpSpecification(spec, latestDatasets) {
  var out = "";
  for (var i = 0; i < spec.length; i++) {
    let block = spec[i];
    switch (block.type) {
      case "input": {
        out += `input ${block.name} { }\n`;
        out += "\n";
        break;
      }
      case "data": {
        out += `data ${block.name} {\n`;
        out += `  dataset_id: ${block.spec.dataset}\n`;
        out += `  hash: ${latestDatasets[block.spec.dataset]}\n`;
        out += `}\n`;
        out += "\n";
        break;
      }
      case "llm": {
        out += `llm ${block.name} {\n`;
        out += `  temperature: ${block.spec.temperature}\n`;
        out += `  max_tokens: ${block.spec.max_tokens}\n`;
        if (block.spec.few_shot_preprompt) {
          out += `  few_shot_preprompt: \n\`\`\`\n${block.spec.few_shot_preprompt}\n\`\`\`\n`;
        }
        if (block.spec.few_shot_count) {
          out += `  few_shot_count: ${block.spec.few_shot_count}\n`;
        }
        if (block.spec.few_shot_prompt) {
          out += `  few_shot_prompt: \n\`\`\`\n${block.spec.few_shot_prompt}\n\`\`\`\n`;
        }
        if (block.spec.prompt) {
          out += `  prompt: \n\`\`\`\n${block.spec.prompt}\n\`\`\`\n`;
        }
        if (block.spec.stop && block.spec.stop.length > 0) {
          out += `  stop: \n\`\`\`\n${block.spec.stop.join("\n")}\n\`\`\`\n`;
        }
        out += `}\n`;
        out += "\n";
        break;
      }
      case "code": {
        out += `code ${block.name} {\n`;
        out += `  code: \n\`\`\`\n${block.spec.code}\n\`\`\`\n`;
        out += `}\n`;
        out += "\n";
        break;
      }
      case "map": {
        out += `map ${block.name} {\n`;
        out += `  from: ${block.spec.from}\n`;
        if (
          block.spec.repeat !== undefined &&
          block.spec.repeat !== null &&
          block.spec.repeat.length > 0
        ) {
          out += `  repeat: ${block.spec.repeat}\n`;
        }
        out += `}\n`;
        out += "\n";
        break;
      }
      case "reduce": {
        out += `reduce ${block.name} { }\n`;
        out += "\n";
        break;
      }

      case "search": {
        out += `search ${block.name} {\n`;
        out += `  query: \n\`\`\`\n${block.spec.query}\n\`\`\`\n`;
        out += `}\n`;
        out += "\n";
        break;
      }
      case "curl": {
        out += `curl ${block.name} {\n`;
        out += `  method: ${block.spec.method}\n`;
        out += `  url: \n\`\`\`\nhttps://${block.spec.url}\n\`\`\`\n`;
        out += `  headers_code: \n\`\`\`\n${block.spec.headers_code}\n\`\`\`\n`;
        out += `  body_code: \n\`\`\`\n${block.spec.body_code}\n\`\`\`\n`;
        out += `}\n`;
        out += "\n";
        break;
      }
    }
  }
  return out.slice(0, -1);
}
