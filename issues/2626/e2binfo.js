// Read-only E2B inspection of sandbox ids recorded by this run. Never lists, never connects.
const fs = require('fs');
const path = require('path');
// The key is handed over by h.py, which reads it through scripts/qa.py (qa.env); never read from a file here.
const apiKey = process.env.QA_E2B_KEY;
if (!apiKey) throw new Error('QA_E2B_KEY not provided');
const { Sandbox } = require('~/Projects/Kody/kodus-ai/node_modules/e2b');
const allowed = new Set(fs.readFileSync(path.join(__dirname, 'own-sandboxes.txt'), 'utf8').split(/\s+/).filter(Boolean));
(async () => {
  for (const id of process.argv.slice(2)) {
    if (!allowed.has(id)) { console.log(JSON.stringify({ id, skipped: 'not recorded as own' })); continue; }
    const out = { id, at: new Date().toISOString() };
    try {
      const i = await Sandbox.getInfo(id, { apiKey });
      out.info = { state: i.state, startedAt: i.startedAt, endAt: i.endAt, templateId: i.templateId, metadata: i.metadata };
    } catch (e) { out.getInfo = `${e.name}: ${String(e.message).slice(0, 160)}`; }
    try {
      const r = await fetch(`https://api.e2b.dev/events/sandboxes/${id}`, { headers: { 'X-API-Key': apiKey } });
      const t = await r.text();
      let ev; try { ev = JSON.parse(t); } catch { ev = null; }
      out.events = Array.isArray(ev) ? ev.map(e => ({ type: e.type, ts: e.timestamp, reason: e.eventData && e.eventData.kill_reason, stage: e.eventData && e.eventData.sandbox_metadata && e.eventData.sandbox_metadata.stage, deployment: e.eventData && e.eventData.sandbox_metadata && e.eventData.sandbox_metadata.deployment, execMs: e.eventData && e.eventData.execution && e.eventData.execution.execution_time })).reverse() : { status: r.status, body: t.slice(0, 200) };
    } catch (e) { out.events = String(e).slice(0, 160); }
    console.log(JSON.stringify(out));
  }
})();
