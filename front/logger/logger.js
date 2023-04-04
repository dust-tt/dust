const tracer = require("dd-trace").init({
  logInjection: true,
});

import pino from "pino";

const logger = pino();

export default logger;
