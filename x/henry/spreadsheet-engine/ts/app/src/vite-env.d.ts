/// <reference types="vite/client" />

// Sample workbooks are imported from the committed corpus as asset URLs.
declare module "*.xlsx?url" {
  const url: string;
  export default url;
}
declare module "*.csv?url" {
  const url: string;
  export default url;
}
declare module "*.tsv?url" {
  const url: string;
  export default url;
}
