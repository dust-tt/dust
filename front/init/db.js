import { User, App, Dataset, Provider } from '../lib/models.js';

async function main() {
  await User.sync({ alter: true });
  await App.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  process.exit(0);
}

await main();
