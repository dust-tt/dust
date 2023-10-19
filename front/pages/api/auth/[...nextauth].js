import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    session: async ({ session, token, user }) => {
      // Legacy support for old tokens.
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
      session.user.email_verified = !!token.provider.email_verified;
      if (!session.user.image) {
        session.user.image = null;
      }
      return session;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async jwt({ token, user, account, profile, isNewUser }) {
      
      if (profile && account && account.provider === "github") {
        token.provider = {
          provider: "github",
          id: profile.id,
          username: profile.login,
          access_token: account.access_token,
        };
      }
      if (profile && account && account.provider === "google") {
        token.provider = {
          provider: "google",
          id: account.providerAccountId,
          username: profile.email.split("@")[0],
          email_verified: profile.email_verified,
          access_token: account.access_token,
        };
      }
      return token;
    },
  },
};

export default NextAuth(authOptions);
