// Map 'e2b' to the stub, then load TS with ts-node (transpile only) + tsconfig paths.
const Module = require('module');
const path = require('path');
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
    if (req === 'e2b') return path.join(__dirname, 'e2b-stub.js');
    return orig.call(this, req, ...rest);
};
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
process.env.TS_NODE_PROJECT = path.join(process.env.H_WT, 'tsconfig.json');
require('ts-node/register');
require('tsconfig-paths/register');
require(path.join(__dirname, process.argv[2]));
