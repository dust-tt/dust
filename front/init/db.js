import {
  User,
  App,
  Dataset,
  Provider,
  Clone,
  Key,
  DataSource,
  XP1Run,
  XP1User,
} from '@app/lib/models.js';

async function main() {
  await User.sync({ alter: true });
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

await main();
