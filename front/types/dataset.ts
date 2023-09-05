export type DatasetEntry = {
  [key: string]: any;
};

export type DatasetType = {
  name: string;
  description: string | null;
  data: Array<DatasetEntry> | null;
};
