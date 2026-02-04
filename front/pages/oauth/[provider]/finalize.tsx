import { OAuthFinalizePage } from "@app/components/pages/oauth/OAuthFinalizePage";

// This endpoint is authenticated but cannot be workspace specific as it is hard-coded at each
// provider as our callback URI. Authentication is handled client-side by the component using
// useAuthContext() which redirects to login if the user is not authenticated.
export default OAuthFinalizePage;
