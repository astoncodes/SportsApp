// Metro needs explicit help in an npm-workspaces monorepo: by default it only
// watches the app directory, so edits to packages/shared or the generated
// database types would not trigger a rebuild, and their imports would not
// resolve from the hoisted root node_modules.
//
// https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so changes in packages/* trigger a reload.
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Stop Metro walking further up the filesystem than the workspace root, which
// otherwise produces confusing duplicate-module errors.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
