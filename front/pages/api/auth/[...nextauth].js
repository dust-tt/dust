import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import withLogging from "@app/logger/withlogging";

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    session: async ({ session, token, user }) => {
      if (token.github && !token.provider) {
        token.provider = {
          provider: "github",
          id: token.github.id,
          username: token.github.login,
          access_token: token.github.access_token,
        };
      }
      session.provider = token.provider;
      session.user.username = token.provider.username;
      if (!session.user.image) {
        session.user.image = null;
      }
      // console.log("TOKEN", token);
      // console.log("SESSION", session);
      return session;
    },
    async jwt({ token, user, account, profile, isNewUser }) {
      // console.log("JWT", token, user, account, profile, isNewUser);
      // console.log("JWT TOKEN", token);
      // console.log("JWT USER", user);
      // console.log("JWT ACCOUNT", account);
      // console.log("JWT PROFILE", profile);
      if (profile && account && account.provider === "github") {
        token.provider = {
          provider: "github",
          id: profile.id,
          username: profile.login,
          access_token: account.access_token,
        };
      }
      // if (profile && account && account.provider === "google") {
      //   token.provider = {
      //     provider: "google",
      //     id: account.providerAccountId,
      //     username: profile.email,
      //     access_token: account.access_token,
      //   };
      // }
      // console.log("JTW");
      // console.log(token);
      return token;
    },
  },
};

export default withLogging(NextAuth(authOptions));
