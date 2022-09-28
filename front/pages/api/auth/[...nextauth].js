import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import SequelizeAdapter from "@next-auth/sequelize-adapter";
import Sequelize from "sequelize";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "front_store.sqlite",
});

// Calling sync() is not recommended in production
sequelize.sync();

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  theme: {
    colorScheme: "light",
  },
  adapter: SequelizeAdapter(sequelize),
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user && user) {
        session.user.id = user.id;
        const userId =
          /https:\/\/avatars.githubusercontent.com\/u\/(\d+)\?/g.exec(
            session.user.image
          )[1];
        const res = await fetch(`https://api.github.com/user/${userId}`);
        session.github = await res.json();
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
