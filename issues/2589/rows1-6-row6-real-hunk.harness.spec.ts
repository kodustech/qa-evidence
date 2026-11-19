const out = (w: string, v: unknown) => console.log(`RESULT row6-real-hunk | ${w} | ${JSON.stringify(v)}`);
it('row 6: the exact hunk of the QA PR', async () => {
    const { retrieveForShard } = require('@libs/code-review/infrastructure/agents/collaborators/rule-context.retriever');
    const patch = require('fs').readFileSync(__dirname + '/../../row6-pr.patch', 'utf8');
    const r = await retrieveForShard({
        file: { filename: 'app/controllers/patient_prescriptions_controller.rb', status: 'modified', patch, content: null } as any,
        rules: [{ uuid: 'r', title: 'r', rule: 'x', contextNeed: { need: 'symbol-references', sourceHash: 'h', source: 'compiler', inferredAt: new Date(0) } }],
        lookup: { available: true, unavailableReason: '', grep: async () => '', read: async () => '', exists: async () => false, probe: async () => undefined, stats: { grep: 0, read: 0, exists: 0, failures: 0 } } as any,
        logger: { warn: (e: any) => out('warn', e.message) },
    });
    out('unmet', r.unmet.map((x: any) => x.uuid));
});
