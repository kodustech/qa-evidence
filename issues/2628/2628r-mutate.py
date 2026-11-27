import sys
W = sys.argv[1]; m = sys.argv[2]
R = W + '/libs/sandbox/infrastructure/repositories/sandbox-lease.repository.ts'
M = W + '/libs/sandbox/infrastructure/services/sandbox-lease-manager.service.ts'
def edit(path, fn):
    s = open(path).read(); t = fn(s); assert t != s, (m, path); open(path, 'w').write(t)
def drop_line(path, n):
    L = open(path).read().split('\n'); assert 'leaseCount: { $not: { $gt: 0 } }' in L[n-1], L[n-1]; del L[n-1]; open(path,'w').write('\n'.join(L))
if m == 'M-a': drop_line(R, 379)
elif m == 'M-b': drop_line(R, 420); drop_line(R, 379)
elif m == 'M-d': drop_line(R, 321)
elif m == 'M-e': edit(R, lambda s: s.replace('sandboxId === undefined\n                ? { _id: prKey }', 'true\n                ? { _id: prKey }', 1))
elif m == 'M-c': edit(M, lambda s: s.replace("            return;\n        }\n\n        try {\n            const doc = await this.leaseRepo.findByPrKey(prKey);", "            return;\n        }\n        return; // MUTANT M-c\n\n        try {\n            const doc = await this.leaseRepo.findByPrKey(prKey);", 1))
elif m == 'M-h': 
    def f(s):
        s = s.replace("        const prKey = this.leaseIdToPrKey.get(leaseId);\n        this.leaseIdToPrKey.delete(leaseId);\n", "        const prKey = this.leaseIdToPrKey.get(leaseId);\n", 1)
        return s.replace("        const updated = await this.leaseRepo.decrementLease(prKey, sandboxId);\n", "        const updated = await this.leaseRepo.decrementLease(prKey, sandboxId);\n        this.leaseIdToPrKey.delete(leaseId); // MUTANT M-h\n", 1)
    edit(M, f)
elif m == 'M-f': edit(M, lambda s: s.replace("    private isBusy(inFlight: InFlightCommands): boolean {\n        return (", "    private isBusy(inFlight: InFlightCommands): boolean {\n        return false && ( // MUTANT M-f", 1))
elif m == 'M-g': edit(M, lambda s: s.replace("const IN_FLIGHT_QUIET_MS = 1_000;", "const IN_FLIGHT_QUIET_MS = 0; // MUTANT M-g", 1))
elif m == 'M-s': edit(M, lambda s: s.replace("    async beforeApplicationShutdown(): Promise<void> {", "    async beforeApplicationShutdownDisabled(): Promise<void> { // MUTANT M-s", 1))
print('applied', m)
