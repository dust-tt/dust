import { createAsyncGenerator } from "@app/lib/api/llm/utils";
import * as converters from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import {
  outputItemToEvents,
  rawOutputToEvents,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type {
  ResponseOutputItem,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

const metadata = {
  lab: "openai",
  host: "openai-responses",
  model: "gpt-5.4",
  region: "global",
} as const;

describe("outputItemToEvents for native web search", () => {
  // Replayed verbatim: the API rejects a reasoning item whose following item was
  // dropped, and a search call routinely sits between a reasoning item and the
  // message.
  it("passes a web_search_call through for verbatim replay", () => {
    const item = {
      type: "web_search_call",
      id: "ws_1",
      status: "completed",
      action: { type: "search", queries: ["who won the last world cup"] },
    } satisfies ResponseOutputItem;

    expect(outputItemToEvents(item, metadata, converters)).toEqual([
      {
        type: "provider_passthrough",
        content: { provider: "openai", block: item },
        metadata,
      },
    ]);
  });

  it("splices url_citation annotations into the message text", () => {
    const item = {
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: "Argentina won.",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.com/wc",
              title: "World Cup",
              start_index: 0,
              end_index: 14,
            },
          ],
        },
      ],
    } satisfies ResponseOutputItem;

    expect(outputItemToEvents(item, metadata, converters)).toMatchObject([
      {
        type: "text",
        content: {
          value: "Argentina won. ([World Cup](https://example.com/wc))",
        },
      },
    ]);
  });

  it("leaves text with no url_citation annotations untouched", () => {
    const item = {
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "plain", annotations: [] }],
    } satisfies ResponseOutputItem;

    expect(outputItemToEvents(item, metadata, converters)).toMatchObject([
      { type: "text", content: { value: "plain" } },
    ]);
  });
});

describe("rawOutputToEvents for native web search", () => {
  async function collect(events: ResponseStreamEvent[]) {
    const out = [];
    for await (const event of rawOutputToEvents(
      createAsyncGenerator(events),
      metadata,
      converters
    )) {
      out.push(event);
    }
    return out;
  }

  // Keeps the live view in step with the authoritative text assembled at
  // `response.output_item.done`, which splices the same links in by offset.
  it("emits an annotation as a text delta carrying the markdown link", async () => {
    const events = await collect([
      {
        type: "response.output_text.annotation.added",
        annotation: {
          type: "url_citation",
          url: "https://example.com/wc",
          title: "World Cup",
          start_index: 0,
          end_index: 14,
        },
        annotation_index: 0,
        content_index: 0,
        item_id: "msg_1",
        output_index: 0,
        sequence_number: 1,
      } as ResponseStreamEvent,
    ]);

    expect(events.filter((event) => event.type === "text_delta")).toEqual([
      {
        type: "text_delta",
        content: { value: " ([World Cup](https://example.com/wc))" },
        metadata,
      },
    ]);
  });

  it("ignores a non-url_citation annotation", async () => {
    const events = await collect([
      {
        type: "response.output_text.annotation.added",
        annotation: { type: "file_path", file_id: "f_1", index: 0 },
        annotation_index: 0,
        content_index: 0,
        item_id: "msg_1",
        output_index: 0,
        sequence_number: 1,
      } as ResponseStreamEvent,
    ]);

    expect(events.filter((event) => event.type === "text_delta")).toEqual([]);
  });

  // These arrive alongside the call item, which is where the logging and
  // passthrough happen, so the progress signals stay unsurfaced.
  it("surfaces nothing for the web_search_call progress events", async () => {
    const events = await collect(
      (
        [
          "response.web_search_call.in_progress",
          "response.web_search_call.searching",
          "response.web_search_call.completed",
        ] as const
      ).map(
        (type, index) =>
          ({
            type,
            item_id: "ws_1",
            output_index: 0,
            sequence_number: index,
          }) as ResponseStreamEvent
      )
    );

    expect(
      events.filter(
        (event) => event.type !== "success" && event.type !== "token_usage"
      )
    ).toEqual([]);
  });
});
