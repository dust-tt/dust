import { createParser } from "eventsource-parser";

import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { DataSourceType } from "@app/types/data_source";

const { DUST_API = "http://localhost:3000" } = process.env;

export type DustAPIErrorResponse = {
  type: string;
  message: string;
};
export type DustAPIResponse<T> = Result<T, DustAPIErrorResponse>;

export type DustAppType = {
  name: string;
  workspaceId: string;
  appId: string;
  appHash: string;
};

export type DustAppConfigType = {
  [key: string]: any;
};

export type DustAppRunErrorEvent = {
  type: "error";
  content: {
    code: string;
    message: string;
  };
};

export type DustAppRunRunStatusEvent = {
  type: "run_status";
  content: {
    status: "running" | "succeeded" | "errored";
    run_id: string;
  };
};

export type DustAppRunBlockStatusEvent = {
  type: "block_status";
  content: {
    block_type: string;
    name: string;
    status: "running" | "succeeded" | "errored";
    success_count: number;
    error_count: number;
  };
};

export type DustAppRunBlockExecutionEvent = {
  type: "block_execution";
  content: {
    block_type: string;
    block_name: string;
    execution: { value: any | null; error: string | null }[][];
  };
};

export type DustAppRunFinalEvent = {
  type: "final";
};

export type DustAppRunTokensEvent = {
  type: "tokens";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    tokens: {
      text: string;
      tokens?: string[];
      logprobs?: number[];
    };
  };
};

export class DustAPI {
  _apiKey: string;

  constructor(apiKey: string) {
    this._apiKey = apiKey;
  }

  async runAppStreamed(
    app: DustAppType,
    config: DustAppConfigType,
    inputs: any[]
  ): Promise<
    DustAPIResponse<{
      eventStream: AsyncGenerator<
        | DustAppRunErrorEvent
        | DustAppRunRunStatusEvent
        | DustAppRunBlockStatusEvent
        | DustAppRunBlockExecutionEvent
        | DustAppRunTokensEvent
        | DustAppRunFinalEvent,
        void,
        unknown
      >;
      dustRunId: Promise<string>;
    }>
  > {
    const res = await fetch(
      `${DUST_API}/api/v1/w/${app.workspaceId}/apps/${app.appId}/runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify({
          specification_hash: app.appHash,
          config: config,
          stream: true,
          blocking: false,
          inputs: inputs,
        }),
      }
    );

    if (!res.ok || !res.body) {
      return new Err({
        type: "dust_api_error",
        message: `Error running streamed app: status_code=${res.status}`,
      });
    }

    let hasRunId = false;
    let rejectDustRunIdPromise: (err: Error) => void;
    let resolveDustRunIdPromise: (runId: string) => void;
    const dustRunIdPromise = new Promise<string>((resolve, reject) => {
      rejectDustRunIdPromise = reject;
      resolveDustRunIdPromise = resolve;
    });

    let pendingEvents: (
      | DustAppRunErrorEvent
      | DustAppRunRunStatusEvent
      | DustAppRunBlockStatusEvent
      | DustAppRunBlockExecutionEvent
      | DustAppRunTokensEvent
      | DustAppRunFinalEvent
    )[] = [];

    const parser = createParser((event) => {
      if (event.type === "event") {
        if (event.data) {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case "error": {
                pendingEvents.push({
                  type: "error",
                  content: {
                    code: data.content.code,
                    message: data.content.message,
                  },
                } as DustAppRunErrorEvent);
                break;
              }
              case "run_status": {
                pendingEvents.push({
                  type: data.type,
                  content: data.content,
                });
                break;
              }
              case "block_status": {
                pendingEvents.push({
                  type: data.type,
                  content: data.content,
                });
                break;
              }
              case "block_execution": {
                pendingEvents.push({
                  type: data.type,
                  content: data.content,
                });
                break;
              }
              case "tokens": {
                pendingEvents.push({
                  type: "tokens",
                  content: data.content,
                } as DustAppRunTokensEvent);
                break;
              }
              case "final": {
                pendingEvents.push({
                  type: "final",
                } as DustAppRunFinalEvent);
              }
            }
            if (data.content?.run_id && !hasRunId) {
              hasRunId = true;
              resolveDustRunIdPromise(data.content.run_id);
            }
          } catch (err) {
            logger.error({ error: err }, "Failed parsing chunk from Dust API");
          }
        }
      }
    });

    const reader = res.body.getReader();

    const streamEvents = async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.feed(new TextDecoder().decode(value));
          for (const event of pendingEvents) {
            yield event;
          }
          pendingEvents = [];
        }
        if (!hasRunId) {
          // once the stream is entirely consumed, if we haven't received a run id, reject the promise
          setImmediate(() => {
            logger.error("No run id received.");
            rejectDustRunIdPromise(new Error("No run id received"));
          });
        }
      } catch (e) {
        yield {
          type: "error",
          content: {
            code: "stream_error",
            message: "Error streaming chunks",
          },
        } as DustAppRunErrorEvent;
        logger.error(
          {
            error: e,
          },
          "Error streaming chunks."
        );
      } finally {
        reader.releaseLock();
      }
    };

    return new Ok({ eventStream: streamEvents(), dustRunId: dustRunIdPromise });
  }

  async getDataSources(
    workspaceId: string
  ): Promise<DustAPIResponse<DataSourceType[]>> {
    const res = await fetch(
      `${DUST_API}/api/v1/w/${workspaceId}/data_sources`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._apiKey}`,
        },
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error);
    }
    return new Ok(json.data_sources);
  }
}
