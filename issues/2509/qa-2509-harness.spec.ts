import { KodyRuleSummaryService } from '@libs/kodyRules/infrastructure/adapters/services/kody-rule-summary.service';
import { buildDetectorCandidates } from './kody-rules-detector.compiler';
import { judgeKodyRulesSharded } from './kody-rules-sharded.judge';
import * as fs from 'fs';

jest.mock('@libs/core/log/logger', () => {
    const spy = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() };
    return { createLogger: () => spy };
});

const report = `class ReportService
  def initialize(orders)
    @orders = orders
  end

  def total_cents
    total = @orders.sum { |o| o.fetch(:amount_cents) }
    puts "report total: #{total}"
    total
  end
end`;
const exportJob = `class ExportJob
  def perform(rows)
    header = rows.first&.keys || []
    binding.pry
    [header] + rows.map(&:values)
  end
end`;
const toFile = (filename: string, src: string): any => {
    const p = src.split('\n').map((l, i) => `${i + 1} +${l}`).join('\n');
    return { filename, status: 'added', patch: p, patchWithLinesStr: p };
};

it('qa2509 harness', async () => {
    const rule = JSON.parse(fs.readFileSync(__dirname + '/qa2509.rule.json', 'utf8'));
    const service = new KodyRuleSummaryService({} as any, {} as any, {} as any);
    const units = service.expandForReview(rule);
    const files = [toFile('qa2509/report_service.rb', report), toFile('qa2509/export_job.rb', exportJob)];
    const detectorHits = buildDetectorCandidates(units.filter((u: any) => u.detector), files);
    const prompts: string[] = [];
    await judgeKodyRulesSharded({
        changedFiles: files,
        rules: units,
        runJudge: async ({ user }) => { prompts.push(user); return []; },
        detectorHits,
        previousDecisions: [{
            suggestionId: 's-1', relevantFile: 'qa2509/report_service.rb', relevantLinesStart: 8, relevantLinesEnd: 8,
            suggestionContent: 'Console write bypasses Rails.logger', label: 'kody_rules',
            brokenKodyRulesIds: [rule.uuid], outcome: 'not_implemented',
        } as any],
    } as any);
    const out: any = {
        units: units.map((u: any) => ({ uuid: u.uuid, reviewUnitId: u.reviewUnitId, title: u.title, detector: !!u.detector })),
        detectorHits: [...detectorHits.entries()].map(([k, v]) => [k, [...v.entries()]]),
        prompts,
    };
    fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(out, null, 1));
});
