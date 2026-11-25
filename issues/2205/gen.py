"""Fixture generator for QA #2205. gen.py <kind> <provider-tag> <outfile> [params]"""
import json, sys, random

def hub(name, tag, entity, lines_target, bug=False, imports=()):
    r = random.Random(name)
    L = [f"// {tag}_HEAD school management: {entity} service (qa2205 fixture)"]
    for imp in imports:
        L.append(imp)
    L.append("")
    L.append(f"export interface {entity}Record {{")
    L.append("    id: string;")
    L.append("    studentId: string;")
    L.append("    classroomId: string;")
    L.append("    termCode: string;")
    L.append("    amountCents: number;")
    L.append("    createdAt: Date;")
    L.append("}")
    L.append("")
    L.append(f"export class {entity}Service {{")
    L.append(f"    private readonly records = new Map<string, {entity}Record>();")
    L.append("")
    i = 0
    body_end = lines_target - (40 if bug else 8)
    while len(L) < body_end:
        i += 1
        f = r.choice(["termTotal", "classroomCount", "studentShare", "latestEntry", "activeTerms"])
        if f == "termTotal":
            L += [f"    termTotal{i}(termCode: string): number {{",
                  "        let total = 0;",
                  "        for (const record of this.records.values()) {",
                  "            if (record.termCode === termCode) total += record.amountCents;",
                  "        }",
                  "        return total;",
                  "    }", ""]
        elif f == "classroomCount":
            L += [f"    classroomCount{i}(classroomId: string): number {{",
                  "        return [...this.records.values()].filter(",
                  "            (record) => record.classroomId === classroomId,",
                  "        ).length;",
                  "    }", ""]
        elif f == "studentShare":
            L += [f"    studentRecords{i}(studentId: string): {entity}Record[] {{",
                  "        return [...this.records.values()]",
                  "            .filter((record) => record.studentId === studentId)",
                  "            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());",
                  "    }", ""]
        elif f == "latestEntry":
            L += [f"    latestFor{i}(studentId: string): {entity}Record | undefined {{",
                  f"        const list = this.studentRecords{i}Fallback(studentId);",
                  "        return list.length ? list[list.length - 1] : undefined;",
                  "    }",
                  f"    private studentRecords{i}Fallback(studentId: string): {entity}Record[] {{",
                  "        return [...this.records.values()].filter((r) => r.studentId === studentId);",
                  "    }", ""]
        else:
            L += [f"    activeTerms{i}(): string[] {{",
                  "        const terms = new Set<string>();",
                  "        for (const record of this.records.values()) terms.add(record.termCode);",
                  "        return [...terms].sort();",
                  "    }", ""]
    L.append("    save(record: " + entity + "Record): void {")
    L.append("        this.records.set(record.id, record);")
    L.append("    }")
    if bug:
        L += ["",
              "    /**",
              "     * Average tuition per enrolled student for a classroom and term.",
              "     * Documented contract: a classroom with no enrolments averages 0.",
              "     */",
              "    tuitionPerStudent(classroomId: string, termCode: string): number {",
              "        const enrolments = [...this.records.values()].filter(",
              "            (r) => r.classroomId === classroomId && r.termCode === termCode,",
              "        );",
              "        const total = enrolments.reduce((sum, r) => sum + r.amountCents, 0);",
              "        return Math.round(total / enrolments.length);",
              "    }",
              "",
              "    classroomInvoiceLine(classroomId: string, termCode: string): string {",
              "        const perStudent = this.tuitionPerStudent(classroomId, termCode);",
              "        return `${classroomId} ${termCode}: ${(perStudent / 100).toFixed(2)} per student`;",
              "    }"]
    L.append("}")
    L.append(f"// {tag}_TAIL")
    return "\n".join(L) + "\n"

def leaf(name, tag, chars_per_line):
    r = random.Random(name)
    def table(prefix, n):
        rows = []
        while len(", ".join(rows)) < n:
            code = prefix + str(len(rows)).zfill(3)
            lo = r.randint(0, 80); hi = lo + r.randint(5, 20)
            rows.append(f"{{ code: '{code}', min: {lo}, max: {hi}, label: '{r.choice(['Insufficient','Basic','Proficient','Advanced','Distinguished'])} band {code}' }}")
        return "[" + ", ".join(rows) + "]"
    l1 = f"export const PRIMARY_BANDS = {table('P', chars_per_line - 120)} as const; // {tag}_HEAD"
    l2 = f"export const SECONDARY_BANDS = {table('S', chars_per_line - 120)} as const; // {tag}_TAIL"
    return l1 + "\n" + l2 + "\n"

def f_large(prov, hub_lines, leaf_chars):
    T = lambda f: f"F2205_{prov}_{f}"
    files = {}
    files["qa2205/attendance/attendance-service.ts"] = hub("att", T("ATTENDANCE"), "Attendance", hub_lines)
    files["qa2205/enrollment/enrollment-service.ts"] = hub("enr", T("ENROLLMENT"), "Enrollment", hub_lines)
    files["qa2205/grading/report-card-service.ts"] = hub("grd", T("REPORTCARD"), "ReportCard", hub_lines)
    files["qa2205/tuition/tuition-service.ts"] = hub("tui", T("TUITION"), "Tuition", hub_lines, bug=True,
        imports=["import { EnrollmentService } from '../enrollment/enrollment-service';", "export type TuitionEnrollmentSource = EnrollmentService;"])
    leaves = ["reference/grade-bands-early-years.ts", "reference/grade-bands-middle-years.ts", "reference/grade-bands-secondary.ts",
              "reference/attendance-codes-table.ts", "reference/fee-schedule-table.ts",
              "reference/tabelas-de-avaliação-pedagógica-ensino-fundamental-séries-iniciais-e-finais.ts"]
    for i, l in enumerate(leaves):
        files["qa2205/" + l] = leaf(l, T("REF%d" % (i + 1)), leaf_chars)
    return files

def f_small(prov):
    return {
        "qa2205small/fees/late-fee.ts": "// F2205_%s_SMALL_A\nexport function lateFeeCents(daysLate: number, baseCents: number): number {\n    if (daysLate <= 0) return 0;\n    const capped = Math.min(daysLate, 30);\n    return Math.round(baseCents * 0.01 * capped);\n}\n" % prov,
        "qa2205small/fees/invoice.ts": "// F2205_%s_SMALL_B\nimport { lateFeeCents } from './late-fee';\n\nexport function invoiceTotalCents(baseCents: number, daysLate: number): number {\n    return baseCents + lateFeeCents(daysLate, baseCents);\n}\n" % prov,
    }

def f_filter(prov):
    files = {
        "qa2205filter/library/loan-service.ts": hub("loan", f"F2205_{prov}_LOAN", "Loan", 95),
        "qa2205filter/library/fine-policy.ts": hub("fine", f"F2205_{prov}_FINE", "Fine", 95),
    }
    spec = ["// F2205_%s_SPEC_EXCLUDED" % prov, "import { LoanService } from './loan-service';", "describe('LoanService', () => {"]
    i = 0
    while len("\n".join(spec)) < 40000:
        i += 1
        spec += [f"    it('keeps loan {i} after save', () => {{", "        const service = new LoanService();", f"        service.save({{ id: 'l{i}', studentId: 's{i}', classroomId: 'c1', termCode: 'T1', amountCents: {i}, createdAt: new Date(0) }});", f"        expect(service.classroomCount1 ? true : true).toBe(true);", "    });"]
    spec.append("});")
    files["qa2205filter/library/loan-service.spec.ts"] = "\n".join(spec) + "\n"
    md = ["# Library loans (F2205_%s_MD_EXCLUDED)" % prov, ""]
    i = 0
    while len("\n".join(md)) < 40000:
        i += 1
        md.append(f"- Rule {i}: a student may hold at most {i % 5 + 1} books from shelf {i} during a term; overdue loans accrue the documented daily fine.")
    files["qa2205filter/docs/loans.md"] = "\n".join(md) + "\n"
    css = ["/* F2205_%s_CSS_EXCLUDED */" % prov]
    i = 0
    while len("\n".join(css)) < 40000:
        i += 1
        css.append(f".shelf-{i} {{ margin: {i % 9}px; padding: {i % 7}px; color: #{(i * 7919) % 0xffffff:06x}; }}")
    files["qa2205filter/styles/library.css"] = "\n".join(css) + "\n"
    return files

def f_compact24(prov):
    files = {}
    for n, (fname, body) in enumerate([("attendance-alert.ts", "export function needsAlert(absences: number, limit: number): boolean {\n    return absences >= limit;\n}\n"),
                                        ("grade-average.ts", "export function average(grades: number[]): number {\n    if (!grades.length) return 0;\n    return grades.reduce((a, b) => a + b, 0) / grades.length;\n}\n"),
                                        ("class-size.ts", "export const MAX_CLASS_SIZE = 32;\nexport function isFull(enrolled: number): boolean {\n    return enrolled >= MAX_CLASS_SIZE;\n}\n")]):
        files[f"qa2205c24/school/{fname}"] = f"// F2205_{prov}_C24_{n}\n" + body * 6
    files["qa2205c24/school/grade-average.spec.ts"] = "// F2205_%s_C24_SPEC1\nimport { average } from './grade-average';\nit('averages', () => expect(average([1, 3])).toBe(2));\n" % prov
    files["qa2205c24/school/class-size.spec.ts"] = "// F2205_%s_C24_SPEC2\nimport { isFull } from './class-size';\nit('is full at 32', () => expect(isFull(32)).toBe(true));\n" % prov
    return files

def f_many(prov, n_src, n_spec):
    files = {}
    for i in range(n_src):
        files[f"qa2205many/rooms/room-{i:03d}.ts"] = f"export const ROOM_{i:03d} = {{ id: 'R{i:03d}', seats: {20 + i % 15} }}; // F2205_{prov}_M{i}\n"
    for i in range(n_spec):
        files[f"qa2205many/rooms/room-{i:03d}.spec.ts"] = f"it('room {i}', () => expect(1).toBe(1));\n"
    return files

if __name__ == "__main__":
    kind, prov, outp = sys.argv[1], sys.argv[2], sys.argv[3]
    args = [int(a) for a in sys.argv[4:]]
    fn = {"large": f_large, "small": f_small, "filter": f_filter, "c24": f_compact24, "many": f_many}[kind]
    json.dump(fn(prov, *args), open(outp, "w"), ensure_ascii=False, indent=0)
