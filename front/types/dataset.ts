export type DatasetEntry = {
  [key: string]: any;
};

export type DatasetType = {
  name: string;
  description?: string;
  data?: Array<DatasetEntry>;
};
