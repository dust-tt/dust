import {
  extractFrameFunctionToolCalls,
  FRAME_TOOL_CALL_REF_MAX_LENGTH,
  sortAndDedupeToolCalls,
} from "@app/lib/api/frames/extract_tool_calls";
import { describe, expect, it } from "vitest";

function sourceMap(
  entries: Record<string, string>
): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe("sortAndDedupeToolCalls", () => {
  it("dedupes and sorts by server then tool", () => {
    expect(
      sortAndDedupeToolCalls([
        ["slack", "search"],
        ["gmail", "get_messages"],
        ["slack", "search"],
        ["gmail", "send"],
      ])
    ).toEqual([
      ["gmail", "get_messages"],
      ["gmail", "send"],
      ["slack", "search"],
    ]);
  });
});

describe("extractFrameFunctionToolCalls", () => {
  it("extracts tools.call string literals from the entry point", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { tools } from "@dust/pod";
          export default {
            async fetch() {
              await tools.call("gmail", "get_messages", { maxResults: 5 });
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value).toEqual([["gmail", "get_messages"]]);
  });

  it("extracts aliased named imports and namespace pod.tools.call", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { tools as dustTools } from "@dust/pod";
          import * as pod from "@dust/pod";
          export default {
            async fetch() {
              await dustTools.call("gmail", "get_messages", {});
              await pod.tools.call("slack", "search", {});
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isOk() && result.value).toEqual([
      ["gmail", "get_messages"],
      ["slack", "search"],
    ]);
  });

  it("accepts no-substitution template literals", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { tools } from "@dust/pod";
          export default {
            async fetch() {
              await tools.call(\`gmail\`, \`get_messages\`);
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isOk() && result.value).toEqual([["gmail", "get_messages"]]);
  });

  it("follows relative imports into helpers", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { fetchMail } from "./lib/mail";
          export default {
            async fetch() {
              return Response.json(await fetchMail());
            },
          };
        `,
        "functions/lib/mail.ts": `
          import { tools } from "@dust/pod";
          export async function fetchMail() {
            return tools.call("gmail", "get_messages", {});
          }
        `,
      }),
    });

    expect(result.isOk() && result.value).toEqual([["gmail", "get_messages"]]);
  });

  it("does not attribute helpers that the entry point does not import", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/list.ts",
      sourceByPath: sourceMap({
        "functions/list.ts": `
          export default {
            async fetch() {
              return Response.json({ ok: true });
            },
          };
        `,
        "functions/other.ts": `
          import { tools } from "@dust/pod";
          export default {
            async fetch() {
              await tools.call("gmail", "get_messages", {});
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isOk() && result.value).toEqual([]);
  });

  it("ignores unrelated .call expressions and non-@dust/pod tools bindings", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          const tools = { call: (a: string, b: string) => {} };
          export default {
            async fetch() {
              tools.call("gmail", "get_messages");
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isOk() && result.value).toEqual([]);
  });

  it("rejects non-literal server or tool arguments", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { tools } from "@dust/pod";
          const server = "gmail";
          export default {
            async fetch() {
              await tools.call(server, "get_messages", {});
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe("non_literal_tools_call");
  });

  it('rejects tools["call"] dynamic member access', () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { tools } from "@dust/pod";
          export default {
            async fetch() {
              await tools["call"]("gmail", "get_messages", {});
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isErr() && result.error.code).toBe("non_literal_tools_call");
  });

  it("rejects server or tool names above the length ceiling", () => {
    const long = "x".repeat(FRAME_TOOL_CALL_REF_MAX_LENGTH + 1);
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { tools } from "@dust/pod";
          export default {
            async fetch() {
              await tools.call("${long}", "get_messages", {});
              return Response.json({});
            },
          };
        `,
      }),
    });

    expect(result.isErr() && result.error.code).toBe("tool_call_ref_too_long");
  });

  it("rejects a missing relative import", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/run.ts",
      sourceByPath: sourceMap({
        "functions/run.ts": `
          import { helper } from "./missing";
          export default { async fetch() { return Response.json({}); } };
        `,
      }),
    });

    expect(result.isErr() && result.error.code).toBe("import_missing");
  });

  it("rejects a missing entry point", () => {
    const result = extractFrameFunctionToolCalls({
      entryPoint: "functions/missing.ts",
      sourceByPath: sourceMap({}),
    });

    expect(result.isErr() && result.error.code).toBe("import_missing");
  });
});
