import assert from 'node:assert/strict';
import {
    FRESH_POOL_MAX_AGE_DAYS,
    MAX_LPERS_TO_SCAN,
    MAX_POOL_AGE_DAYS,
    SCHEDULE_INTERVAL_HOURS,
    SCHEDULE_INTERVAL_MS,
    isFreshPoolByAge,
    shouldScanPoolByAge
} from '../scanRules';

assert.equal(FRESH_POOL_MAX_AGE_DAYS, 3);
assert.equal(MAX_POOL_AGE_DAYS, 300);
assert.equal(MAX_LPERS_TO_SCAN, 15);
assert.equal(SCHEDULE_INTERVAL_HOURS, 72);
assert.equal(SCHEDULE_INTERVAL_MS, 72 * 60 * 60 * 1000);

assert.equal(isFreshPoolByAge(0.5), true);
assert.equal(isFreshPoolByAge(2.99), true);
assert.equal(isFreshPoolByAge(3), false);
assert.equal(isFreshPoolByAge(3.01), false);

assert.equal(shouldScanPoolByAge(0.5), true);
assert.equal(shouldScanPoolByAge(2), true);
assert.equal(shouldScanPoolByAge(299.99), true);
assert.equal(shouldScanPoolByAge(300), true);
assert.equal(shouldScanPoolByAge(300.01), false);
assert.equal(shouldScanPoolByAge(689.75), false);

console.log('scanRules tests passed');
