import type { SpecificationType } from "@app/types";
import type { BlockType } from "@app/types";

export function recomputeIndents(spec: SpecificationType): SpecificationType {
  let indent = 0;
  for (let i = 0; i < spec.length; i++) {
    switch (spec[i].type) {
      case "map":
        spec[i].indent = indent;
        indent++;
        break;
      case "reduce":
        indent--;
        spec[i].indent = indent;
        break;
      case "while":
        spec[i].indent = indent;
        indent++;
        break;
      case "end":
        indent--;
        spec[i].indent = indent;
        break;
      default:
        spec[i].indent = indent;
        break;
    }
  }
  return spec;
}

function getNextName(spec: SpecificationType, name: string): string {
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

export function addBlock(
  spec: SpecificationType,
  idx: number,
  blockType: BlockType | "map_reduce" | "while_end"
): SpecificationType {
  const s = spec.map((b) => b);
  switch (blockType) {
    case "input":
      // TODO(spolu): prevent if we already have an input
      s.splice(idx + 1, 0, {
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
      // TODO(spolu): prevent if we are already inside a map or while
      s.splice(idx + 1, 0, {
        type: "map",
        name: getNextName(spec, "LOOP"),
        indent: 0,
        spec: {
          from: "INPUT",
          repeat: "",
        },
        config: {},
      });
      s.splice(idx + 2, 0, {
        type: "reduce",
        name: getNextName(spec, "LOOP"),
        indent: 0,
        spec: {},
        config: {},
      });
      break;
    case "while_end":
      // TODO(spolu): prevent if we are already inside a map or while
      s.splice(idx + 1, 0, {
        type: "while",
        name: getNextName(spec, "LOOP"),
        indent: 0,
        spec: {
          condition_code: "_fun = (env) => {\n  // return false;\n}",
          max_iterations: "8",
        },
        config: {},
      });
      s.splice(idx + 2, 0, {
        type: "end",
        name: getNextName(spec, "LOOP"),
        indent: 0,
        spec: {},
        config: {},
      });
      break;
    case "data":
      s.splice(idx + 1, 0, {
        type: "data",
        name: getNextName(spec, "EXAMPLES"),
        indent: 0,
        spec: {},
        config: {},
      });
      break;
    case "search":
      s.splice(idx + 1, 0, {
        type: "search",
        name: getNextName(spec, "SEARCH"),
        indent: 0,
        spec: {
          query: "",
        },
        config: {
          provider_id: "",
          use_cache: true,
        },
      });
      break;
    case "browser":
      s.splice(idx + 1, 0, {
        type: "browser",
        name: getNextName(spec, "WEBCONTENT"),
        indent: 0,
        spec: {
          url: "",
          selector: "body",
          timeout: 16000,
          wait_until: "networkidle2",
        },
        config: {
          provider_id: "",
          use_cache: true,
          error_as_output: false,
        },
      });
      break;
    case "curl":
      s.splice(idx + 1, 0, {
        type: "curl",
        name: "",
        indent: 0,
        spec: {
          scheme: "https",
          method: "POST",
          url: "",
          headers_code:
            '_fun = (env) => {\n  return {"Content-Type": "application/json"};\n}',
          body_code:
            '_fun = (env) => {\n  // return a string or null to skip sending a body.\n  return JSON.stringify({ foo: "bar" });\n}',
        },
        config: {
          use_cache: true,
        },
      });
      break;
    case "llm":
      s.splice(idx + 1, 0, {
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
          use_cache: true,
        },
      });
      break;
    case "chat":
      s.splice(idx + 1, 0, {
        type: "chat",
        name: getNextName(spec, "MODEL"),
        indent: 0,
        spec: {
          temperature: 0.7,
          instructions: "",
          max_tokens: "",
          stop: [],
          messages_code:
            '_fun = (env) => {\n  // return [{ role: "user", content: "hi!"}];\n}',
          functions_code:
            "_fun = (env) => {\n" +
            "  // See https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models\n" +
            "  // return [{\n" +
            '  //  name: "...",\n' +
            '  //  description: "...",\n' +
            "  //  parameters: ...\n" +
            "  // }];\n" +
            "}",
        },
        config: {
          provider_id: "",
          model_id: "",
          function_call: "",
          use_cache: true,
        },
      });
      break;
    case "code":
      s.splice(idx + 1, 0, {
        type: "code",
        name: "",
        indent: 0,
        spec: {
          code: "_fun = (env) => {\n  // `env.state.BLOCK_NAME` contains BLOCK_NAME's output.\n}",
        },
        config: {},
      });
      break;
    case "data_source":
      s.splice(idx + 1, 0, {
        type: "data_source",
        name: getNextName(spec, "DATASOURCE"),
        indent: 0,
        spec: {
          query: "",
          full_text: false,
          filter_code:
            "_fun = (env) => {\n" +
            "  // return {\n" +
            "  //   tags: { in: env.state.INPUT.tags, not: null },\n" +
            "  //   parents: { in: null, not: null },\n" +
            "  //   timestamp: { gt: 1711377963110, lt: env.state.CODE.lt }\n" +
            "  // };\n" +
            "}",
        },
        config: {
          data_sources: null,
          top_k: 8,
          filter: { tags: null, timestamp: null },
          use_cache: false,
        },
      });
      break;
    case "database_schema":
      s.splice(idx + 1, 0, {
        type: "database_schema",
        name: getNextName(spec, "DATABASE_SCHEMA"),
        indent: 0,
        spec: {},
        config: {},
      });
      break;
    case "database":
      s.splice(idx + 1, 0, {
        type: "database",
        name: getNextName(spec, "DATABASE"),
        indent: 0,
        spec: {
          query: "",
        },
        config: {},
      });
      break;
    default:
      s.splice(idx + 1, 0, {
        type: blockType,
        name: "",
        indent: 0,
        spec: {},
        config: {},
      });
  }
  return recomputeIndents(s);
}

export function deleteBlock(
  spec: SpecificationType,
  index: number
): SpecificationType {
  const s = spec.map((b) => b);
  if (index > -1 && index < spec.length) {
    switch (s[index].type) {
      case "map":
        s.splice(index, 1);
        for (let i = index; i < s.length; i++) {
          if (s[i].type == "reduce") {
            s.splice(i, 1);
            break;
          }
        }
        break;
      case "while":
        s.splice(index, 1);
        for (let i = index; i < s.length; i++) {
          if (s[i].type == "end") {
            s.splice(i, 1);
            break;
          }
        }
        break;
      case "reduce":
        s.splice(index, 1);
        for (let i = index - 1; i >= 0; i--) {
          if (s[i].type == "map") {
            s.splice(i, 1);
            break;
          }
        }
        break;
      case "end":
        s.splice(index, 1);
        for (let i = index - 1; i >= 0; i--) {
          if (s[i].type == "while") {
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

export function moveBlockUp(
  spec: SpecificationType,
  index: number
): SpecificationType {
  const s = spec.map((b) => b);
  if (index > 0 && index < spec.length) {
    switch (s[index].type) {
      case "map":
      case "reduce":
      case "while":
      case "end":
        if (["map", "reduce", "while", "end"].includes(s[index - 1].type)) {
          break;
        }
      // eslint-disable-next-line no-fallthrough
      default:
        const tmp = s[index - 1];
        s[index - 1] = s[index];
        s[index] = tmp;
        break;
    }
  }
  return recomputeIndents(s);
}

export function moveBlockDown(
  spec: SpecificationType,
  index: number
): SpecificationType {
  const s = spec.map((b) => b);
  if (index > -1 && index < spec.length - 1) {
    switch (s[index].type) {
      case "map":
      case "reduce":
      case "while":
      case "end":
        if (["map", "reduce", "while", "end"].includes(s[index + 1].type)) {
          break;
        }
      // eslint-disable-next-line no-fallthrough
      default:
        const tmp = s[index + 1];
        s[index + 1] = s[index];
        s[index] = tmp;
    }
  }
  return recomputeIndents(s);
}

function escapeTripleBackticks(s: string): string {
  return s.replace(/```/g, "<DUST_TRIPLE_BACKTICKS>");
}
export function restoreTripleBackticks(s: string): string {
  return s.replace(/<DUST_TRIPLE_BACKTICKS>/g, "```");
}

export function dumpSpecification(
  spec: SpecificationType,
  latestDatasets: { [key: string]: string }
): string {
  let out = "";

  for (let i = 0; i < spec.length; i++) {
    const block = spec[i];
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
        if (block.spec.max_tokens) {
          out += `  max_tokens: ${block.spec.max_tokens}\n`;
        }
        if (block.spec.stop && block.spec.stop.length > 0) {
          out += `  stop: \n\`\`\`\n${block.spec.stop.join("\n")}\n\`\`\`\n`;
        }
        if (block.spec.frequency_penalty) {
          out += `  frequency_penalty: ${block.spec.frequency_penalty}\n`;
        }
        if (block.spec.presence_penalty) {
          out += `  presence_penalty: ${block.spec.presence_penalty}\n`;
        }
        if (block.spec.top_p) {
          out += `  top_p: ${block.spec.top_p}\n`;
        }
        if (block.spec.top_logprobs) {
          out += `  top_logprobs: ${block.spec.top_logprobs}\n`;
        }
        if (block.spec.few_shot_preprompt) {
          out += `  few_shot_preprompt: \n\`\`\`\n${escapeTripleBackticks(
            block.spec.few_shot_preprompt
          )}\n\`\`\`\n`;
        }
        if (block.spec.few_shot_count) {
          out += `  few_shot_count: ${block.spec.few_shot_count}\n`;
        }
        if (block.spec.few_shot_prompt) {
          out += `  few_shot_prompt: \n\`\`\`\n${escapeTripleBackticks(
            block.spec.few_shot_prompt
          )}\n\`\`\`\n`;
        }
        if (block.spec.prompt) {
          out += `  prompt: \n\`\`\`\n${escapeTripleBackticks(
            block.spec.prompt
          )}\n\`\`\`\n`;
        }
        out += `}\n`;
        out += "\n";
        break;
      }
      case "chat": {
        out += `chat ${block.name} {\n`;
        out += `  temperature: ${block.spec.temperature}\n`;
        if (block.spec.max_tokens) {
          out += `  max_tokens: ${block.spec.max_tokens}\n`;
        }
        if (block.spec.stop && block.spec.stop.length > 0) {
          out += `  stop: \n\`\`\`\n${block.spec.stop.join("\n")}\n\`\`\`\n`;
        }
        if (block.spec.top_p) {
          out += `  top_p: ${block.spec.top_p}\n`;
        }
        if (block.spec.presence_penalty) {
          out += `  presence_penalty: ${block.spec.presence_penalty}\n`;
        }
        if (block.spec.frequency_penalty) {
          out += `  frequency_penalty: ${block.spec.frequency_penalty}\n`;
        }
        if (block.spec.instructions) {
          out += `  instructions: \n\`\`\`\n${escapeTripleBackticks(
            block.spec.instructions
          )}\n\`\`\`\n`;
        }
        if (block.spec.logprobs) {
          out += `  logprobs: true\n`;
        }
        if (block.spec.top_logprobs) {
          out += `  top_logprobs: ${block.spec.top_logprobs}\n`;
        }
        out += `  messages_code: \n\`\`\`\n${escapeTripleBackticks(
          block.spec.messages_code
        )}\n\`\`\`\n`;
        if (block.spec.functions_code) {
          out += `  functions_code: \n\`\`\`\n${escapeTripleBackticks(
            block.spec.functions_code
          )}\n\`\`\`\n`;
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
      case "data_source": {
        out += `data_source ${block.name} {\n`;
        out += `  query: \n\`\`\`\n${escapeTripleBackticks(
          block.spec.query
        )}\n\`\`\`\n`;
        out += `  full_text: ${block.spec.full_text ? "true" : "false"}\n`;
        if (block.spec.filter_code) {
          out += `  filter_code: \n\`\`\`\n${escapeTripleBackticks(
            block.spec.filter_code
          )}\n\`\`\`\n`;
        }
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
      case "while": {
        out += `while ${block.name} {\n`;
        out += `  condition_code: \n\`\`\`\n${escapeTripleBackticks(
          block.spec.condition_code
        )}\n\`\`\`\n`;
        if (
          block.spec.max_iterations !== undefined &&
          block.spec.max_iterations !== null &&
          block.spec.max_iterations.length > 0
        ) {
          out += `  max_iterations: ${block.spec.max_iterations}\n`;
        }
        out += `}\n`;
        out += "\n";
        break;
      }
      case "end": {
        out += `end ${block.name} { }\n`;
        out += "\n";
        break;
      }
      case "search": {
        out += `search ${block.name} {\n`;
        out += `  query: \n\`\`\`\n${block.spec.query}\n\`\`\`\n`;
        if (block.spec.num) {
          out += `  num: ${block.spec.num}\n`;
        }
        out += `}\n`;
        out += "\n";
        break;
      }
      case "curl": {
        out += `curl ${block.name} {\n`;
        out += `  method: ${block.spec.method}\n`;
        out += `  url: \n\`\`\`\n${block.spec.scheme}://${block.spec.url}\n\`\`\`\n`;
        out += `  headers_code: \n\`\`\`\n${block.spec.headers_code}\n\`\`\`\n`;
        out += `  body_code: \n\`\`\`\n${block.spec.body_code}\n\`\`\`\n`;
        out += `}\n`;
        out += "\n";
        break;
      }
      case "browser": {
        out += `browser ${block.name} {\n`;
        out += `  url: \n\`\`\`\n${block.spec.url}\n\`\`\`\n`;
        out += `  selector: \n\`\`\`\n${block.spec.selector}\n\`\`\`\n`;
        if (block.spec.timeout) {
          out += `  timeout: ${block.spec.timeout}\n`;
        }
        if (block.spec.wait_until) {
          out += `  wait_until: ${block.spec.wait_until}\n`;
        }
        if (block.spec.wait_for) {
          out += `  wait_for: \n\`\`\`\n${block.spec.wait_for}\n\`\`\`\n`;
        }
        out += `}\n`;
        out += "\n";
        break;
      }
      case "database_schema": {
        out += `database_schema ${block.name} { }\n`;
        out += "\n";
        break;
      }
      case "database": {
        out += `database ${block.name} {\n`;
        out += `  query: \n\`\`\`\n${escapeTripleBackticks(
          block.spec.query
        )}\n\`\`\`\n`;
        out += `}\n`;
        out += "\n";
        break;
      }
      default:
        ((t: never) => {
          console.error(`Unknown block type: ${t}`);
        })(block.type);
    }
  }
  return out.slice(0, -1);
}
