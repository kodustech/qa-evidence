import validateKodusConfigFile, { getDefaultKodusConfigFile } from '@libs/common/utils/validateCodeReviewConfigFile';
import * as schema from '@libs/common/schemas/codereview.json';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const S: any = (schema as any).default ?? schema;
function resolve(node: any): any {
    if (node?.$ref) {
        const p = node.$ref.replace(/^#\//, '').split('/');
        let n: any = S; for (const k of p) n = n[k]; return resolve(n);
    }
    return node;
}
function build(node: any): any {
    node = resolve(node);
    if (node.default !== undefined) return JSON.parse(JSON.stringify(node.default));
    if (node.enum) return node.enum[0];
    const t = Array.isArray(node.type) ? node.type[0] : node.type;
    if (t === 'object' || node.properties) {
        const o: any = {};
        for (const k of node.required ?? []) o[k] = build(node.properties[k]);
        return o;
    }
    if (t === 'array') return [];
    if (t === 'boolean') return false;
    if (t === 'string') return node.pattern ? '1.2' : 'x';
    if (t === 'number' || t === 'integer') return node.minimum ?? 0;
    return null;
}
const out: any = {};
afterAll(() => fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(out, null, 1)));
test('M2 matrix', () => {
    const V = build(S);
    const base = validateKodusConfigFile(V);
    out.V_valid = base.isValidConfigFile; out.V_errors = (base.validationErrors ?? []).map((e: any) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);
    const cases: Record<string, any> = {
        true: { implicitReplies: true }, false: { implicitReplies: false }, absent: undefined, empty: {},
        string_false: { implicitReplies: 'false' }, unknown_key: { answerEveryone: true }, array: [false], scalar: false, null_value: { implicitReplies: null }, number0: { implicitReplies: 0 },
    };
    out.cases = {};
    for (const [k, v] of Object.entries(cases)) {
        const c = { ...V }; if (v !== undefined) c.conversation = v;
        const r = validateKodusConfigFile(c);
        out.cases[k] = { valid: r.isValidConfigFile, errors: (r.validationErrors ?? []).map((e: any) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`) };
    }
    const d: any = getDefaultKodusConfigFile();
    out.shippedDefault = d?.conversation;
    out.shippedRaw = (yaml.load(fs.readFileSync(path.join(process.cwd(), 'default-kodus-config.yml'), 'utf8')) as any)?.conversation;
});
