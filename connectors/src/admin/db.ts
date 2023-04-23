import { Connector, SlackConfiguration } from '../lib/models.js';

async function main(): Promise<void> {
  await SlackConfiguration.sync({ alter: true });
  await Connector.sync({ alter: true });
  return;
}

main()
  .then(() => {
    console.log('Done');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
