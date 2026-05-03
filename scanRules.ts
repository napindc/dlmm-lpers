export const FRESH_POOL_MAX_AGE_DAYS = 3;
export const MAX_POOL_AGE_DAYS = 300;
export const MAX_LPERS_TO_SCAN = 15;
export const MAX_SURVIVORS_PER_POOL = 3;
export const SCHEDULE_INTERVAL_HOURS = 72;
export const SCHEDULE_INTERVAL_MS = SCHEDULE_INTERVAL_HOURS * 60 * 60 * 1000;

export function isFreshPoolByAge(ageDays: number): boolean {
    return ageDays < FRESH_POOL_MAX_AGE_DAYS;
}

export function shouldScanPoolByAge(ageDays: number): boolean {
    return ageDays <= MAX_POOL_AGE_DAYS;
}
