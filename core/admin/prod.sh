#!/bin/sh

./admin/forever.sh 2>&1 | tee -i /var/log/datadog/dust_core.log
