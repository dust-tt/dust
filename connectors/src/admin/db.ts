import {
    Connector,
    SlackConfiguration
  } from "../lib/models";
  
  async function main() {
    
    SlackConfiguration.sync({ alter: true });
    Connector.sync({ alter: true });
  
    
  }
  
  main()
    .then(() => {
      console.log("Done");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
  