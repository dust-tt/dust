export interface SearchResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  date?: string;
  source?: string;
}

export interface ImageResult {
  position: number;
  title: string;
  link: string;
  thumbnail: string;
  source?: string;
}
