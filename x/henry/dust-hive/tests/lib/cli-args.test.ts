import { describe, expect, it } from "bun:test";
import { cac } from "cac";
import { expandNegatedShortFlags } from "../../src/lib/cli-args";

type ParsedOptions = {
  forward?: boolean;
  open?: boolean;
  attach?: boolean;
};

function parseWithCac(args: string[]): ParsedOptions {
  const cli = cac("dust-hive");
  let parsed: ParsedOptions = {};
  const capture = (_names: unknown, options: ParsedOptions) => {
    parsed = options;
  };
  cli
    .command("spawn [name]")
    .option("-O, --no-open", "")
    .option("-A, --no-attach", "")
    .action(capture);
  cli.command("warm [...names]").option("-F, --no-forward", "").action(capture);
  cli.parse(expandNegatedShortFlags(["bun", "dust-hive", ...args]));
  return parsed;
}

describe("expandNegatedShortFlags", () => {
  it("makes -F disable forwarding like --no-forward", () => {
    expect(parseWithCac(["warm", "-F", "env"]).forward).toBe(false);
  });

  it("makes -O and -A disable open and attach like their long forms", () => {
    const options = parseWithCac(["spawn", "-O", "-A", "env"]);

    expect(options.open).toBe(false);
    expect(options.attach).toBe(false);
  });

  it("leaves the defaults on when no flag is given", () => {
    expect(parseWithCac(["warm", "env"]).forward).toBe(true);
  });

  it("leaves other arguments untouched", () => {
    expect(expandNegatedShortFlags(["warm", "-p", "env"])).toEqual(["warm", "-p", "env"]);
  });
});
