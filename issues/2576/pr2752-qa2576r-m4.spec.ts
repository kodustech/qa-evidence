import 'reflect-metadata';
import * as fs from 'fs';
import { ValidationPipe } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { CreateOrUpdateCodeReviewParameterDto } from '@libs/organization/dtos/create-or-update-code-review-parameter.dto';

// Same options as apps/api/src/main.ts (global pipe).
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } });
const cases: Array<[string, unknown, string?]> = [
    ...(['false', 'no', 'off', 'true', 0, 1, null, [false], {}, true, false] as unknown[]).map((x) => [`implicitReplies=${JSON.stringify(x)}`, { conversation: { implicitReplies: x } }] as [string, unknown]),
    ...([null, [{ implicitReplies: false }], 'off', false, 0] as unknown[]).map((x) => [`conversation=${JSON.stringify(x)}`, { conversation: x }] as [string, unknown]),
    ['conversation={}', { conversation: {} }],
    ['repo implicitReplies=true', { conversation: { implicitReplies: true } }, 'repo-1'],
    ['unknown key', { conversation: { answerEveryone: true } }],
    ['other key only', { runOnDraft: false }],
];
it('R4 pipe matrix', async () => {
    const out: any[] = [];
    for (const [label, configValue, repositoryId] of cases) {
        try {
            const dto: any = await pipe.transform({ organizationAndTeamData: { teamId: 't' }, configValue, ...(repositoryId ? { repositoryId } : {}) }, { type: 'body', metatype: CreateOrUpdateCodeReviewParameterDto });
            const plain: any = instanceToPlain(dto);
            out.push({ label, accepted: true, conversation: dto.configValue?.conversation, conversationPlain: plain.configValue?.conversation, keys: Object.keys(plain.configValue || {}) });
        } catch (e: any) {
            out.push({ label, accepted: false, message: e?.getResponse?.()?.message ?? String(e) });
        }
    }
    fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(out, null, 1));
});
