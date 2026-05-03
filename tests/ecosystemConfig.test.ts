import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync(join(__dirname, '..', 'ecosystem.config.json'), 'utf8'));

assert.equal(config.apps[0].name, 'dlmm-lpers');

console.log('ecosystem config tests passed');
