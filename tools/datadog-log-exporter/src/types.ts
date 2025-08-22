export interface LogEvent {
  id: string;
  attributes?: Record<string, unknown> & {
    timestamp?: string;
    attributes?: Record<string, unknown>;
  };
}

export interface LogsResponseMeta {
  page?: { after?: string | null };
}

export interface LogsResponse {
  data?: LogEvent[];
  meta?: LogsResponseMeta;
  links?: { next?: string };
}

export interface Args {
  query: string;
  columns: string[];
  outPath: string;
  pageLimit: number;
  resume: boolean;
  targetPerWindow: number;
  fromMs: number;
  toMs: number;
  initialWindow: number;
  maxWindow: number;
  minWindow: number;
  site: string;
  apiKey: string;
  appKey: string;
}

export interface StateFile {
  currentTo: number;
  windowMs: number;
  cursor: string | null;
  windowCount: number;
  totalCount: number;
  lastPageIds?: string[];
}

