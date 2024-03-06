import { handleAuth, handleLogin } from "@auth0/nextjs-auth0";

export default handleAuth({
  login: handleLogin({
    authorizationParams: {
      scope: "openid profile email",
    },
  }),
});
