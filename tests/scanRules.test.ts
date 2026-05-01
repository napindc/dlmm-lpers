import assert from 'node:assert/strict';
import { MAX_LPERS_TO_SCAN, MAX_POOL_AGE_DAYS, shouldScanPoolByAge } from '../scanRules';

assert.equal(MAX_POOL_AGE_DAYS, 300);
assert.equal(MAX_LPERS_TO_SCAN, 15);

assert.equal(shouldScanPoolByAge(0.5), true);
assert.equal(shouldScanPoolByAge(2), true);
assert.equal(shouldScanPoolByAge(299.99), true);
assert.equal(shouldScanPoolByAge(300), true);
assert.equal(shouldScanPoolByAge(300.01), false);
assert.equal(shouldScanPoolByAge(689.75), false);

console.log('scanRules tests passed');
