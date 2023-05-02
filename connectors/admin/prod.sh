#!/bin/sh

# See https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/

export DD_ENV=prod
export DD_SERVICE=connectors
export NODE_OPTIONS='-r dd-trace/init'
export DD_LOGS_INJECTION=true
export DD_RUNTIME_METRICS_ENABLED=true
export NODE_ENV=production

env $(cat .env.local) npx tsx ./src/start.ts -p 3002 2>&1 | tee /var/log/datadog/dust_connectors.log
