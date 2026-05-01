import assert from 'node:assert/strict';
import { isBannedPairName, normalizePairName } from '../poolFilters';

assert.equal(normalizePairName('sol/usdc'), 'SOL/USDC');
assert.equal(normalizePairName('  cbBTC / usdc  '), 'CBBTC/USDC');

assert.equal(isBannedPairName('SOL/USDC'), true);
assert.equal(isBannedPairName('sol/usdc'), true);
assert.equal(isBannedPairName('cbBTC/USDC'), true);
assert.equal(isBannedPairName('BONK/USDC'), false);

console.log('poolFilters tests passed');
