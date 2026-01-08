const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Enable importing from parent directories (extension/shared)
const extensionRoot = path.resolve(__dirname, "../..");
config.watchFolders = [extensionRoot];

// Configure resolver to find @app/* imports
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(extensionRoot, "node_modules"),
];

// Add extra node modules resolution for workspace packages and polyfills
config.resolver.extraNodeModules = {
  "@app": extensionRoot,
  // Node.js polyfills for packages that expect them
  buffer: path.resolve(__dirname, "node_modules/buffer"),
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  inlineRem: 16,
});
