import pino from 'pino'

// // create pino-logflare console stream for serverless functions and send function for browser logs
// // Browser logs are going to: https://logflare.app/sources/13989
// // Vercel log drain was setup to send logs here: https://logflare.app/sources/13830

// // const { stream, send } = logflarePinoVercel({
// //     apiKey: "eA_3wro12LpZ",
// //     sourceToken: "eb1d841a-e0e4-4d23-af61-84465c808157"
// // });

// // create pino logger {},  pino.destination("./pino-logger.log")

const logger = pino();

// const { createLogger, format, transports } = require('winston');

// const logger = createLogger({
//   level: 'info',
//   exitOnError: false,
//   format: format.json(),
//   transports: [
//     new transports.File({ filename: `${appRoot}/logs/log.log` }),
//   ],
// });

// module.exports = logger;


export default logger;

