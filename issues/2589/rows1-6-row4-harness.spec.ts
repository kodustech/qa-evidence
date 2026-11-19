/**
 * QA harness for #2589 rows 1-6. Runs the real code at whatever commit is
 * checked out; only the external dependency (TypeORM repository, AMQP
 * channel, LLM/analysis service, repo lookup) is stubbed. Each test prints a
 * RESULT line instead of asserting, so the same file runs at the merge commit
 * and at its first parent.
 */
const out = (row: string, what: string, value: unknown) =>
    // eslint-disable-next-line no-console
    console.log(`RESULT ${row} | ${what} | ${JSON.stringify(value)}`);

describe('#2589 row 4 harness', () => {
    it('row 4: TypeORM logger and error serializer on a failed INSERT with a secret bound value', async () => {
        const SECRET = 'qa2589-fake-secret-value-0123456789';
        const { QueryFailedError } = require('typeorm');
        const captured: any[] = [];
        let entry: any;
        jest.isolateModules(() => {
            jest.doMock('@libs/core/log/logger', () => ({
                ...jest.requireActual('@libs/core/log/logger'),
                createLogger: () => ({ log: (e: any) => captured.push(e), debug: (e: any) => captured.push(e), warn: (e: any) => captured.push(e), error: (e: any) => captured.push(e) }),
            }));
            const { TypeOrmCustomLogger } = require('@libs/core/infrastructure/database/typeorm/logger');
            const l = new TypeOrmCustomLogger();
            const err = new QueryFailedError(
                'INSERT INTO "auth"("uuid","refreshToken") VALUES ($1,$2)',
                ['row-uuid', SECRET],
                Object.assign(new Error('duplicate key value violates unique constraint "UQ_5fb5d6abb950a839551fe3c5de9"'), {
                    code: '23505', constraint: 'UQ_5fb5d6abb950a839551fe3c5de9', detail: `Key ("refreshToken")=(${SECRET}) already exists.`,
                }),
            );
            l.logQueryError(err, 'INSERT INTO "auth"("uuid","refreshToken") VALUES ($1,$2)', ['row-uuid', SECRET]);
            entry = captured[0];
            (globalThis as any).__err = err;
        });
        const real = jest.requireActual('@libs/core/log/logger');
        const serializedErr = JSON.stringify(real.deepSanitize(real.boundErrorForLog((globalThis as any).__err)));
        const metaLine = JSON.stringify(real.deepSanitize(entry.metadata));
        out('row4', 'metadata.parameters as logged', String(entry.metadata.parameters).includes(SECRET) ? 'CONTAINS SECRET' : entry.metadata.parameters);
        out('row4', 'secret present in logged metadata', metaLine.includes(SECRET));
        out('row4', 'secret present in serialized error (detail/parameters/driverError)', serializedErr.includes(SECRET));
        out('row4', 'constraint kept in serialized error', serializedErr.includes('UQ_5fb5d6abb950a839551fe3c5de9'));
        out('row4', 'column name kept in serialized error', serializedErr.includes('refreshToken'));
    });

});
