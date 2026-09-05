import * as fs from "node:fs";
import * as path from "node:path";
import type { z } from "zod";

import type { LargeLanguageModel } from "@/index";
import type { inputConfigSchema } from "@/types/config";
import type { LargeLanguageModelResponseEventWithMetadata } from "@/types/events";
import type { Payload } from "@/types/messages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbstractConstructor<I, O> = abstract new (
  ...args: any[]
) => LargeLanguageModel<I, O>;

export function WithStreamDebug<I, O, T extends AbstractConstructor<I, O>>(
  Base: T
) {
  abstract class WithStreamDebug extends Base {
    async *streamWithDebug(
      input: Payload,
      config: z.infer<typeof this.configSchema>
    ): AsyncGenerator<LargeLanguageModelResponseEventWithMetadata> {
      const configValidationResult = this.configSchema.safeParse(config);

      if (!configValidationResult.success) {
        yield {
          type: "error",
          content: {
            type: "input_configuration",
            message: configValidationResult.error.message,
          },
          metadata: this.model,
        };
        return;
      }

      const payload = this.buildRequestPayload(
        input,
        configValidationResult.data
      );

      const dateString = new Date().toISOString();

      await fs.promises.writeFile(
        path.join(process.cwd(), `${dateString}_1_input.json`),
        JSON.stringify({ input, config }, null, 2),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(process.cwd(), `${dateString}_2_payload.json`),
        JSON.stringify(payload, null, 2),
        "utf8"
      );

      const rawEvents: O[] = [];
      const rawStream = this.streamRaw(payload);

      async function* tapRaw(stream: AsyncGenerator<O>): AsyncGenerator<O> {
        for await (const event of stream) {
          rawEvents.push(event);
          yield event;
        }
      }

      const convertedEvents: LargeLanguageModelResponseEventWithMetadata[] =
        [];
      for await (const event of this.rawOutputToEvents(tapRaw(rawStream))) {
        convertedEvents.push(event);
        yield event;
      }

      await fs.promises.writeFile(
        path.join(process.cwd(), `${dateString}_3_raw_output.json`),
        JSON.stringify(rawEvents, null, 2),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(process.cwd(), `${dateString}_4_converted_output.json`),
        JSON.stringify(convertedEvents, null, 2),
        "utf8"
      );
    }
  }

  // Cast: concrete subclasses passed to the mixin already implement all abstract
  // members, but TS can't verify that through the abstract constraint. The cast
  // is safe because WithStreamDebug only adds a new method and doesn't introduce
  // new abstract members.
  return WithStreamDebug as unknown as {
    new (...args: ConstructorParameters<T>): InstanceType<T> & {
      streamWithDebug(
        input: Payload,
        config: z.infer<typeof inputConfigSchema>
      ): AsyncGenerator<LargeLanguageModelResponseEventWithMetadata>;
    };
  } & Omit<T, "prototype">;
}

export type WithStreamDebugInstance = InstanceType<
  ReturnType<
    typeof WithStreamDebug<unknown, unknown, AbstractConstructor<unknown, unknown>>
  >
>;
