#!/bin/sh

cp package.json package.json.save
cp mailing/package.json package.json
node mailing/$1.js
mv package.json.save package.json