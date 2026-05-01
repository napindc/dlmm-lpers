import assert from 'node:assert/strict';
import { getRuntimeMode } from '../runtimeMode';

assert.equal(getRuntimeMode(undefined), 'scheduled');
assert.equal(getRuntimeMode(''), 'scheduled');
assert.equal(getRuntimeMode('false'), 'scheduled');
assert.equal(getRuntimeMode('0'), 'scheduled');
assert.equal(getRuntimeMode('true'), 'run-now');
assert.equal(getRuntimeMode('1'), 'run-now');

console.log('runtimeMode tests passed');
