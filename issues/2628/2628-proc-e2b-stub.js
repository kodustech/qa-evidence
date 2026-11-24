// e2b stub for the worker processes: records every SDK call to $H_E2B_LOG.
const fs = require('fs');
const log = (op, args) => fs.appendFileSync(process.env.H_E2B_LOG, JSON.stringify({ pid: process.pid, op, args, at: new Date().toISOString() }) + '\n');
class SandboxError extends Error {}
class NotFoundError extends SandboxError {}
class TimeoutError extends SandboxError {}
class RateLimitError extends SandboxError {}
const hang = process.env.H_E2B_SETTIMEOUT === 'hang';
module.exports = {
    Sandbox: {
        setTimeout: async (...a) => { log('setTimeout', a.slice(0, 2)); if (hang) await new Promise(() => {}); },
        kill: async (...a) => { log('kill', a.slice(0, 1)); return true; },
        connect: async (id) => { log('connect', [id]); return { sandboxId: id, commands: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) }, files: { read: async () => '', write: async () => {} } }; },
        list: async () => ({ nextItems: async () => [], hasNext: false }),
    },
    SandboxError, NotFoundError, TimeoutError, RateLimitError, CommandExitError: SandboxError,
};
