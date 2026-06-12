import type { Command } from "@commander-js/extra-typings";
import { Argument } from "@commander-js/extra-typings";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type CliCommand<T extends z.ZodObject<any> = z.ZodObject<any>> = {
  path: [string, string];
  description: string;
  groupDescription?: string;
  schema: T;
  run: (args: z.infer<T>) => Promise<unknown>;
};

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional) {
    return unwrapSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapSchema(schema._def.innerType as z.ZodTypeAny);
  }
  return schema;
}

export function buildCliProgram(
  commands: CliCommand[],
  program: Command
): void {
  const byMajor = new Map<string, CliCommand[]>();

  for (const cmd of commands) {
    const major = cmd.path[0];
    if (!byMajor.has(major)) {
      byMajor.set(major, []);
    }
    byMajor.get(major)!.push(cmd);
  }

  for (const [major, cmds] of byMajor) {
    const groupDescription = cmds[0]?.groupDescription ?? `${major} commands`;

    // Cast to any: options are registered dynamically in a loop, which defeats
    // @commander-js/extra-typings' generic chain. Runtime behavior is correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const majorCmd = program
      .command(major)
      .description(groupDescription)
      .addArgument(
        new Argument("<subcommand>", "sub command to run").choices(
          cmds.map((c) => c.path[1])
        )
      ) as any;

    // Collect the union of all option fields across all subcommands
    const allFields = new Map<string, z.ZodTypeAny>();
    for (const cmd of cmds) {
      for (const [field, fieldSchema] of Object.entries(cmd.schema.shape)) {
        if (!allFields.has(field)) {
          allFields.set(field, fieldSchema as z.ZodTypeAny);
        }
      }
    }

    for (const [field, fieldSchema] of allFields) {
      const desc = fieldSchema.description ?? "";
      const base = unwrapSchema(fieldSchema);

      if (base instanceof z.ZodBoolean) {
        majorCmd.option(`--${field}`, desc);
      } else if (base instanceof z.ZodNumber) {
        majorCmd.option(`--${field} <value>`, desc, parseInt);
      } else {
        majorCmd.option(`--${field} <value>`, desc);
      }
    }

    majorCmd.action(
      async (subcommand: string, opts: Record<string, unknown>) => {
        const cmd = cmds.find((c) => c.path[1] === subcommand);
        if (!cmd) {
          console.error(`\x1b[31mUnknown subcommand: ${subcommand}\x1b[0m`);
          process.exit(1);
        }
        const parsed = cmd.schema.safeParse(opts);
        if (!parsed.success) {
          console.error(
            `\x1b[31mError: ${fromError(parsed.error).toString()}\x1b[0m`
          );
          process.exit(1);
        }
        const result = await cmd.run(parsed.data);
        console.log(JSON.stringify(result, null, 2));
        console.error("\x1b[32mDone\x1b[0m");
      }
    );
  }
}
