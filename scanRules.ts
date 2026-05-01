export const MAX_POOL_AGE_DAYS = 300;
export const MAX_LPERS_TO_SCAN = 15;
export const MAX_SURVIVORS_PER_POOL = 3;

export function shouldScanPoolByAge(ageDays: number): boolean {
    return ageDays <= MAX_POOL_AGE_DAYS;
}
