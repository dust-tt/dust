import { Connector, SlackConfiguration } from '@app/lib/models';

async function main() {
await SlackConfiguration.sync({ alter: true });
await Connector.sync({ alter: true });
  
  process.exit(0);
}

main()
  .then(() => {
    console.log('Done');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
