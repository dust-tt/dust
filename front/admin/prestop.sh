#!/bin/sh
curl -X POST "http://$(hostname -i):3000/api/$PRESTOP_SECRET/prestop"
