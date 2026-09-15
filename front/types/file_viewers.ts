export interface FileViewerType {
  email: string;
  firstViewedAt: number;
  lastViewedAt: number;
  // Number of calendar days with recorded views.
  viewedDays: number;
}
