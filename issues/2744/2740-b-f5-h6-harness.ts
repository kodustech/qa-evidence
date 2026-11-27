import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { withoutSecretFileLines } from '@libs/common/utils/tool-output/secret-files';
const [mode, side, ...files] = process.argv.slice(2);
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  if (mode === 'perf') {
    // whole output at once, like the tool's filter on a big exec result; best of 2
    const times: number[] = [];
    let out = '';
    for (let i = 0; i < 2; i++) { const t = performance.now(); out = withoutSecretFileLines(text); times.push(performance.now() - t); }
    const mb = text.length / 1e6;
    console.log(JSON.stringify({ side, file: f, mb: +mb.toFixed(1), ms: Math.round(Math.min(...times)), msPerMB: +(Math.min(...times) / mb).toFixed(2), outLen: out.length, sameAsInput: out === text }));
  } else {
    const out = withoutSecretFileLines(text);
    fs.writeFileSync(`s30-out-${side}.txt`, out);
    const inLines = text.split('\n').length, outLines = out.split('\n').length;
    console.log(JSON.stringify({ side, inLines, outLines, dropped: inLines - outLines, sha: createHash('sha256').update(out).digest('hex').slice(0, 16) }));
  }
}
