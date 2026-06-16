export interface GetShareFrameMetadataResponseBody {
  faviconUrl: string | null;
  logoUrl: string | null;
  ogImageUrl: string | null;
  requiresEmailVerification: boolean;
  shareUrl: string;
  title: string;
  vizUrl: string;
  workspaceId: string;
  workspaceName: string;
}
