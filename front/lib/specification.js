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

export function addBlock(spec, blockType) {
  let s = spec.map((b) => b);
  switch (blockType) {
    case "map_reduce":
      s.push({
        type: "map",
        name: "LOOP",
        indent: 0,
        spec: {
          from: "INPUT",
          repeat: "",
        },
      });
      s.push({
        type: "reduce",
        name: "LOOP",
        indent: 0,
        spec: {},
      });
      break;
    case "root":
      s.push({
        type: "root",
        name: "INPUT",
        indent: 0,
        spec: {},
      });
      break;
    case "data":
      s.push({
        type: "data",
        name: "EXAMPLES",
        indent: 0,
        spec: {},
      });
      break;
    case "llm":
      s.push({
        type: "llm",
        name: "MODEL",
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
      });
      break;
    case "code":
      s.push({
        type: "code",
        name: "",
        indent: 0,
        spec: {
          code: "_fun = (env) => {\n  // env['state'][BLOCK_NAME] constains BLOCK_NAME output.\n}",
        },
      });
      break;
    default:
      s.push({
        type: blockType,
        name: "",
        indent: 0,
        spec: {},
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
