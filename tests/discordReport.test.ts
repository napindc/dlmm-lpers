import assert from 'node:assert/strict';
import {
    VALHALLA_INTRO,
    buildCategoryWebhookContent,
    buildWalletChartTitle,
    formatWalletChartLabel
} from '../discordReport';

const wallet = 'AbCdEf1234567890WalletTail';

assert.equal(formatWalletChartLabel(wallet), 'AbCdEf,,,Tail');
assert.equal(buildWalletChartTitle('SOL/USDC', wallet, 42.4), 'AbCdEf,,,Tail · 42 SOL total');
assert.ok(!buildWalletChartTitle('SOL/USDC', wallet, 42.4).includes('SOL/USDC'));

assert.equal(
    buildCategoryWebhookContent('Best in Last 2 Days', 'wallet rows', VALHALLA_INTRO),
    'Below are profitable Meteora wallets you can copy trade with Valhalla! To begin just type in Discord here "/valhalla start"\n**🔍 Best in Last 2 Days**\nwallet rows'
);

console.log('discord report tests passed');
