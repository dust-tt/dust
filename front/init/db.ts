import {
  App,
  Clone,
  Dataset,
  DataSource,
  Key,
  Provider,
  User,
  Workspace,
  Membership,
  XP1Run,
  XP1User,
} from "@app/lib/models";

async function main() {
  await User.sync({ alter: true });
  await Workspace.sync({ alter: true });
  await Membership.sync({ alter: true });
  await App.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await Key.sync({ alter: true });
  await DataSource.sync({ alter: true });
  await XP1User.sync({ alter: true });
  await XP1Run.sync({ alter: true });

  process.exit(0);
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
