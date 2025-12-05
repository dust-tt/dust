#!/bin/bash

# Tiny script to start the dev environment using mprocs.
# Needed to clear the dist of the sdks-js project before starting front so it waits for the sdks-js to be ready.

# Clear the dist of the sdks-js project
rm -rf ../sdks/js/dist

# Start the dev environment using mprocs
mprocs