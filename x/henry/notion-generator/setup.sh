#!/bin/bash

# Install dependencies
echo "Installing dependencies..."
npm install

# Install type definitions
echo "Installing type definitions..."
npm install --save-dev @types/node

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file from example..."
  cp .env.example .env
  echo "Please update the .env file with your Notion API key and parent page ID."
fi

# Build the project
echo "Building the project..."
npm run build

echo "Setup complete! You can now run the generator with 'npm start'" 