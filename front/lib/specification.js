export function addBlock(spec, blockType) {
  let s = spec.map((b) => b);
  switch (blockType) {
    case "map_reduce":
      s.push({
        type: "map",
        name: "",
        spec: {},
      });
      s.push({
        type: "reduce",
        name: "",
        spec: {},
      });
      break;
    case "root":
      s.push({
        type: "root",
        name: "INPUT",
        spec: {},
      });
      break;
    case "data":
      s.push({
        type: "data",
        name: "EXAMPLES",
        spec: {},
      });
      break;
    case "llm":
      s.push({
        type: "llm",
        name: "MODEL",
        spec: {
          temperature: 0.7,
          max_tokens: 64,
          few_shot_preprompt: null,
          few_shot_count: 0,
          few_shot_prompt: null,
          prompt: '',
          stop: [],
        },
      });
      break;
    default:
      s.push({
        type: blockType,
        name: "",
        spec: {},
      });
  }
  return s;
}

export function deleteBlock(spec, index) {
  let s = spec.map((b) => b);
  if (index > -1 && index < spec.length) {
    s.splice(index, 1);
  }
  return s;
}

export function moveBlockUp(spec, index) {
  let s = spec.map((b) => b);
  if (index > 0 && index < spec.length) {
    let tmp = s[index - 1];
    s[index - 1] = s[index];
    s[index] = tmp;
  }
  return s;
}

export function moveBlockDown(spec, index) {
  let s = spec.map((b) => b);
  if (index > -1 && index < spec.length - 1) {
    let tmp = s[index + 1];
    s[index + 1] = s[index];
    s[index] = tmp;
  }
  return s;
}
