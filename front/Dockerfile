FROM node:18.15.0 as front

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# fake database URIs are needed because Sequelize will throw if the `url` parameter
# is undefined, and `next build` imports the `models.ts` file while "Collecting page data"
RUN FRONT_DATABASE_URI="sqlite:foo.sqlite" XP1_DATABASE_URI="sqlite:bar.sqlite" npm run build


CMD ["npm", "--silent", "run", "start"]