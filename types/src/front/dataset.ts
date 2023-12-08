export type DatasetEntry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type DatasetType = {
  name: string;
  description: string | null;
  data: Array<DatasetEntry> | null;
  schema?: DatasetSchema | null;
};

export type DatasetSchema = {
  key: string;
  type: "string" | "number" | "boolean" | "json";
  description: string | null;
}[];
