#!/bin/sh

./admin/forever.sh 2>&1 | tee /var/log/datadog/dust_core.log