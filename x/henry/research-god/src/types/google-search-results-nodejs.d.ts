declare module "google-search-results-nodejs" {
  export class getJson {
    constructor(apiKey: string);
    json(params: Record<string, any>, callback: (data: any) => void): void;
  }
}
