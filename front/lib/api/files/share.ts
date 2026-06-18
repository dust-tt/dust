export interface GetShareFrameMetadataResponseBody {
  description: string | null;
  faviconUrl: string | null;
  logoUrl: string | null;
  ogImageUrl: string | null;
  requiresEmailVerification: boolean;
  shareUrl: string;
  showSignUpCta: boolean;
  title: string;
  vizUrl: string;
  workspaceId: string;
  workspaceName: string;
}
