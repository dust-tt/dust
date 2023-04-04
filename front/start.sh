#!/bin/sh

npx next build

export DD_ENV=prod
export DD_SERVICE=front
export NODE_OPTIONS='-r dd-trace/init'
export DD_LOGS_INJECTION=true
export DD_RUNTIME_METRICS_ENABLED=true

npx next start 2>&1 | tee /var/log/datadog/dust_front.log
