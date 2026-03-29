const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const sdkPath = path.resolve(__dirname, "../../../sdks/js");
const rootPath = path.resolve(__dirname, "../../..");

config.watchFolders = [sdkPath, rootPath];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(rootPath, "node_modules"),
];
// Ensure single copies of react/react-native
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, "node_modules/react"),
  "react-native": path.resolve(__dirname, "node_modules/react-native"),
};

module.exports = config;
