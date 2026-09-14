export interface FileViewerType {
  email: string;
  firstViewedAt: number;
  lastViewedAt: number;
  // Number of UTC calendar days with recorded views, not a count of visits.
  viewedDays: number;
}
