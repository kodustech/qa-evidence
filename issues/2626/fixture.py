F = {
'src/qa2626/tuition.ts': '''export const DEFAULT_PRICE_PER_CREDIT = 120;

export function totalTuition(credits: number, pricePerCredit: number): number {
    if (credits < 0) {
        throw new Error('credits must be positive');
    }
    return credits * pricePerCredit;
}
''',
'src/qa2626/enrollment.ts': '''import { DEFAULT_PRICE_PER_CREDIT, totalTuition } from './tuition';
import { schoolTerm } from './unchanged';

export class EnrollmentService {
    quote(credits: number): number {
        return totalTuition(credits, DEFAULT_PRICE_PER_CREDIT);
    }

    enroll(studentId: string, credits: number, at: Date) {
        return {
            studentId,
            term: schoolTerm(at),
            amount: this.quote(credits),
        };
    }
}
''',
'src/qa2626/archive.ts': '''import { schoolTerm } from './unchanged';

export function archiveStudent(studentId: string, at: Date): string {
    return `${studentId}@${schoolTerm(at)}`;
}
''',
'src/qa2626/unchanged.ts': '''export function schoolTerm(at: Date): string {
    const half = at.getMonth() < 6 ? 1 : 2;
    return `${at.getFullYear()}-${half}`;
}
''',
}
I = {
'src/qa2626/tuition.ts': '''export const DEFAULT_PRICE_PER_CREDIT = 120;

export function tuitionDue(credits: number, pricePerCredit: number): number {
    if (credits < 0) {
        throw new Error('credits must be positive');
    }
    return credits * pricePerCredit;
}
''',
'src/qa2626/enrollment.ts': '''import { DEFAULT_PRICE_PER_CREDIT, tuitionDue } from './tuition';
import { applyScholarship } from './scholarship';
import { schoolTerm } from './unchanged';

export class EnrollmentService {
    quote(credits: number, scholarshipPercent = 0): number {
        return applyScholarship(
            tuitionDue(credits, DEFAULT_PRICE_PER_CREDIT),
            scholarshipPercent,
        );
    }

    enroll(studentId: string, credits: number, at: Date) {
        return {
            studentId,
            term: schoolTerm(at),
            amount: this.quote(credits),
        };
    }
}
''',
'src/qa2626/archive.ts': None,
'src/qa2626/scholarship.ts': '''export function applyScholarship(amount: number, percent: number): number {
    const bounded = Math.min(Math.max(percent, 0), 100);
    return amount - (amount * bounded) / 100;
}
''',
}
