import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    session: async ({ session, token, user }) => {
      // session.token = token;
      session.github = token.github;
      session.user.username = token.github.login;
      // console.log("SESSION");
      // console.log(session);
      return session;
    },
    async jwt({ token, user, account, profile, isNewUser }) {
      if (profile && account) {
        token.github = {
          login: profile.login,
          id: profile.id,
          access_token: account.access_token,
        };
      }
      // console.log("JTW");
      // console.log(token);
      return token;
    },
  },
};

export default NextAuth(authOptions);
