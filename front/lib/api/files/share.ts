export interface GetShareFrameMetadataResponseBody {
  faviconUrl: string | null;
  logoUrl: string | null;
  requiresEmailVerification: boolean;
  shareUrl: string;
  title: string;
  vizUrl: string;
  workspaceId: string;
  workspaceName: string;
}
