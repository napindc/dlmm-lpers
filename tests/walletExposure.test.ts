import assert from 'node:assert/strict';
import { computeTotalSolExposure, sumOpenPositionValueNative } from '../walletExposure';

assert.equal(sumOpenPositionValueNative([]), 0);
assert.equal(
    sumOpenPositionValueNative([
        { valueNative: 1.25 },
        { valueNative: '2.5' },
        { valueNative: null },
        {}
    ]),
    3.75
);

assert.equal(
    computeTotalSolExposure(1.5, [
        { valueNative: 2 },
        { valueNative: '3.25' }
    ]),
    6.75
);

console.log('walletExposure tests passed');
