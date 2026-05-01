import assert from 'node:assert/strict';
import { fmtSol } from '../formatting';

assert.equal(fmtSol(0), '0 SOL');
assert.equal(fmtSol(12.25), '12 SOL');
assert.equal(fmtSol(1234.56), '1,235 SOL');
assert.equal(fmtSol(65541.13), '65,541 SOL');

console.log('formatting tests passed');
