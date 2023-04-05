type BlockType =
  | "input"
  | "data"
  | "data_source"
  | "code"
  | "llm"
  | "chat"
  | "map"
  | "reduce"
  | "search"
  | "curl"
  | "browser";

type RunRunType = "deploy" | "local" | "execute";
type Status = "running" | "succeeded" | "errored";

type RunConfig = {
  blocks: { [key: string]: any };
};

type RunStatus = {
  run: Status;
  blocks: BlockStatus[];
};

type BlockStatus = {
  block_type: BlockType;
  name: string;
  status: Status;
  success_count: number;
  error_count: number;
};

export type RunType = {
  run_id: string;
  created: number;
  run_type: RunRunType;
  app_hash: string;
  config: RunConfig;
  status: RunStatus;
  traces: Array<
    [[BlockType, string], Array<Array<{ value?: any; error?: string }>>]
  >;
};
