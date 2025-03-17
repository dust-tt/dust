"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeDependencies = exports.composePackageJson = void 0;
const composePackageJson = (template) => ({ name, author, includeHuskyConfig }) => {
    const pkgJson = Object.assign(Object.assign({}, template.packageJson), { name,
        author, module: `dist/${name}.esm.js`, 'size-limit': [
            {
                path: `dist/${name}.cjs.production.min.js`,
                limit: '10 KB',
            },
            {
                path: `dist/${name}.esm.js`,
                limit: '10 KB',
            },
        ] });
    if (!includeHuskyConfig) {
        delete pkgJson.husky;
    }
    return pkgJson;
};
exports.composePackageJson = composePackageJson;
const composeDependencies = (template) => ({ includeHusky }) => {
    return template.dependencies.filter((dep) => dep !== 'husky' || includeHusky);
};
exports.composeDependencies = composeDependencies;
