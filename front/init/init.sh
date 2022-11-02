#!/bin/sh

cp package.json package.json.save
cp init/package.json package.json
node init/db.js
mv package.json.save package.json
