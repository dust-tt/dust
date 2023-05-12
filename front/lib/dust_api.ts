import { createParser } from "eventsource-parser";

import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

const { DUST_API = "https://dust.tt" } = process.env;

export type DustAPIErrorResponse = {
  type: string;
  message: string;
};
export type DustAPIResponse<T> = Result<T, DustAPIErrorResponse>;

export type DustAppType = {
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

export type DustAPICredentials = {
  apiKey: string;
  workspaceId: string;
};

/**
 * This help functions process a streamed response in the format of the Dust API for running
 * streamed apps.
 *
 * @param res an HTTP response ready to be consumed as a stream
 */
async function processStreamedRunResponse(res: Response): Promise<
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

export class DustAPI {
  _credentials: DustAPICredentials;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(credentials: DustAPICredentials) {
    this._credentials = credentials;
  }

  workspaceId(): string {
    return this._credentials.workspaceId;
  }

  /**
   * This functions talks directly to the Dust production API to create a streamed run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
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
          Authorization: `Bearer ${this._credentials.apiKey}`,
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

    return processStreamedRunResponse(res);
  }

  /**
   * This actions talks to the Dust production API to retrieve the list of data sources of the
   * specified workspace id.
   *
   * @param workspaceId string the workspace id to fetch data sources for
   */
  async getDataSources(
    workspaceId: string
  ): Promise<DustAPIResponse<DataSourceType[]>> {
    const res = await fetch(
      `${DUST_API}/api/v1/w/${workspaceId}/data_sources`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
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

/**
 * This function is intended to be used by the client directly. It proxies through the local
 * `front` instance to execute an action while injecting the system API key of the owner. This is
 * required as we can't push the system API key to the client to talk direclty to Dust production.
 *
 * See /front/pages/api/w/[wId]/use/actions/[action]/index.ts
 *
 * @param owner WorkspaceType the owner workspace running the action
 * @param action string the action name
 * @param config DustAppConfigType the action config
 * @param inputs any[] the action inputs
 */
export async function runActionStreamed(
  owner: WorkspaceType,
  action: string,
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
  const res = await fetch(`/api/w/${owner.sId}/use/actions/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config: config,
      inputs: inputs,
    }),
  });

  return processStreamedRunResponse(res);
}
