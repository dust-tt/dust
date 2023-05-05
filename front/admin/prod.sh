#!/bin/sh

npx next build

# See https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/

export DD_ENV=prod
export DD_SERVICE=front
export NODE_OPTIONS='-r dd-trace/init'
export DD_LOGS_INJECTION=true
export DD_RUNTIME_METRICS_ENABLED=true
export NODE_ENV=production

npx next start 2>&1 | tee -i /var/log/datadog/dust_front.log
