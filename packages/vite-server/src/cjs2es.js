const rollup = require('rollup');

const commonjsPlugin = require('rollup-plugin-commonjs');
const resolvePlugin = require('rollup-plugin-node-resolve');
const autoExternalPlugin = require('rollup-plugin-auto-external');

const resolveModule = require('resolve');

async function resolvePkg(moduleName, options) {
    return new Promise((resolve, reject) => {
        resolveModule(moduleName, options, (err, res, pkg) => {
            if (err) {
                reject(err);
            } else {
                resolve({res, pkg});
            }
        });
    });
}

async function build(moduleName) {
    const basedir = process.cwd();
    const {res, pkg} = await resolvePkg(moduleName, {basedir: basedir});

    // We prefer using the modules we're testing (@khanacademy/*) in ES6 form.
    // There are also some modules which are easier to bundle using their ES6
    // versions.
    // TODO(kevinb): make this configurable
    const useModule = pkg && pkg.module
        && (pkg.name.startsWith("@khanacademy") || 
            pkg.name === "react-router-dom" || 
            pkg.name === "history" || 
            pkg.name === "aphrodite");

    const input = useModule
        ? res.replace(pkg.main, pkg.module)
        : res;

    const plugins = [];
    
    // For ES6 modules we don't want exclude all dependencies from the bundle.
    // The reason for this is that some of them may or may not be ES6 modules
    // and rollup doesn't work well when including a CommonJS module from an
    // ES6 module.
    if (useModule && pkg.name !== "aphrodite") {
        plugins.push(
            autoExternalPlugin({
                packagePath: res.replace(pkg.main, "package.json"),
            })
        );
    }
        
    plugins.push(
        resolvePlugin({
            module: true,
            jsnext: true,
            main: true,
            browser: true,
        }),
    );

    // For CommonJS modules we have to provide a list of named exports.
    if (!useModule) {
        plugins.push(
            commonjsPlugin({
                namedExports: {
                    [input]: Object.keys(require(input)).filter(key => key !== "default"),
                },
            })
        );
    } else if (pkg.name === "aphrodite") {
        // Fixes MISSING_EXPORT error with aphrodite which is caused by
        // aphrodite not not having a default export.
        plugins.push(commonjsPlugin({}));
    }

    const inputOptions = {
        input,
        plugins,
    };

    const outputOptions = {
        format: 'esm',
    };

    // create a bundle
    const bundle = await rollup.rollup(inputOptions);

    // generate code and a sourcemap
    let {code} = await bundle.generate(outputOptions);

    // TODO: use built-in plugin
    code = code
        .replace(/process\.env\.NODE_ENV/g, '"production"');

    // rename imports to have an absolute path
    // note: rollup generates 'import Foo from "foo"' statements instead of 
    // 'import * as Foo from "foo"'.
    return code.replace(/\s+from\s+['"]([^'"]+)['"]/g, 
        (match, path) => ` from "/node_modules/${path}.js"`);
}

module.exports = build;
