FROM node:18.15.0 as front

COPY ../types/ /types
RUN npm ci

WORKDIR /app

RUN pwd 
RUN ls -al 
COPY /front/package*.json ./
RUN pwd 
RUN ls -al 
RUN npm ci

COPY /front /app

# fake database URIs are needed because Sequelize will throw if the `url` parameter
# is undefined, and `next build` imports the `models.ts` file while "Collecting page data"
# RUN FRONT_DATABASE_URI="sqlite:foo.sqlite" XP1_DATABASE_URI="sqlite:bar.sqlite" npm run build


# CMD ["npm", "run", "start"]