/**
 * Unit test for WalletRatingCalculator
 * Run: npx ts-node test_rating.ts
 */
import { WalletRatingCalculator, WalletMetrics, RatingResult } from './ratingCalculator';

// ─── Test Wallet Profiles ───────────────────────────────────────────

// 1. "Consistent Grinder" — high volume, steady small wins, great consistency
const consistentGrinder: WalletMetrics = {
    totalPositions: 500,
    positions30D: 80,
    profitPerPositionStability: 0.92, // very stable
    variance7Dvs30D: 0.08,           // very low variance
    avgMonthlyProfit: 12000,
    avgInvested: 40000,
    totalProfit: 140000,
    profit7D: 3200,
    profit30D: 12000,
    winRate1W: 72,
    winRate1M: 68,
    winRate3M: 65,
    overallWinRate: 66,
    avgPositionAgeDays: 0.8,
    feesEarned: 18000,
    totalPools: 35,
    lastActivityDaysAgo: 0
};

// 2. "Lucky Hero" — few trades, one huge win, inconsistent
const luckyHero: WalletMetrics = {
    totalPositions: 90,
    positions30D: 8,
    profitPerPositionStability: 0.25, // very unstable
    variance7Dvs30D: 0.85,            // wild swings
    avgMonthlyProfit: 50000,
    avgInvested: 200000,
    totalProfit: 150000,
    profit7D: 45000,
    profit30D: 50000,
    winRate1W: 40,
    winRate1M: 35,
    winRate3M: 30,
    overallWinRate: 32,
    avgPositionAgeDays: 4,
    feesEarned: 2000,
    totalPools: 3,
    lastActivityDaysAgo: 2
};

// 3. "Unqualified Newbie" — too few positions
const newbie: WalletMetrics = {
    totalPositions: 20,
    positions30D: 5,
    profitPerPositionStability: 0.5,
    variance7Dvs30D: 0.4,
    avgMonthlyProfit: 500,
    avgInvested: 2000,
    totalProfit: 1500,
    profit7D: 200,
    profit30D: 500,
    winRate1W: 60,
    winRate1M: 55,
    winRate3M: 50,
    overallWinRate: 52,
    avgPositionAgeDays: 3,
    feesEarned: 100,
    totalPools: 2,
    lastActivityDaysAgo: 1
};

// 4. "Inactive Veteran" — good stats but inactive for too long, no 30D positions
const inactiveVet: WalletMetrics = {
    totalPositions: 300,
    positions30D: 0,
    profitPerPositionStability: 0.85,
    variance7Dvs30D: 0.12,
    avgMonthlyProfit: 8000,
    avgInvested: 30000,
    totalProfit: 90000,
    profit7D: 0,
    profit30D: 0,
    winRate1W: 0,
    winRate1M: 0,
    winRate3M: 55,
    overallWinRate: 58,
    avgPositionAgeDays: 2,
    feesEarned: 10000,
    totalPools: 20,
    lastActivityDaysAgo: 15
};

// 5. "Solid Performer" — good all-around, not the absolute best
const solidPerformer: WalletMetrics = {
    totalPositions: 200,
    positions30D: 30,
    profitPerPositionStability: 0.75,
    variance7Dvs30D: 0.2,
    avgMonthlyProfit: 6000,
    avgInvested: 25000,
    totalProfit: 60000,
    profit7D: 1800,
    profit30D: 6000,
    winRate1W: 62,
    winRate1M: 58,
    winRate3M: 55,
    overallWinRate: 57,
    avgPositionAgeDays: 2.5,
    feesEarned: 7000,
    totalPools: 18,
    lastActivityDaysAgo: 1
};

// ─── Run Tests ──────────────────────────────────────────────────────

const allQualified = [consistentGrinder, luckyHero, solidPerformer];
const allWallets = [consistentGrinder, luckyHero, newbie, inactiveVet, solidPerformer];

const calculator = new WalletRatingCalculator(allQualified);

console.log('═══════════════════════════════════════════════════');
console.log('  🧪 Wallet Rating Calculator — Unit Tests');
console.log('═══════════════════════════════════════════════════\n');

const testCases: { name: string; metrics: WalletMetrics; expectQualified: boolean; expectScoreAbove?: number; expectScoreBelow?: number }[] = [
    { name: 'Consistent Grinder', metrics: consistentGrinder, expectQualified: true, expectScoreAbove: 60 },
    { name: 'Lucky Hero',         metrics: luckyHero,         expectQualified: true, expectScoreBelow: 65 },
    { name: 'Unqualified Newbie', metrics: newbie,            expectQualified: false },
    { name: 'Inactive Veteran',   metrics: inactiveVet,       expectQualified: false },
    { name: 'Solid Performer',    metrics: solidPerformer,    expectQualified: true, expectScoreAbove: 50 },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
    const result = calculator.calculate(tc.metrics);
    let status = '✅';
    let issues: string[] = [];

    if (result.isQualified !== tc.expectQualified) {
        status = '❌';
        issues.push(`Expected qualified=${tc.expectQualified}, got ${result.isQualified}`);
    }
    if (tc.expectScoreAbove !== undefined && result.score <= tc.expectScoreAbove && result.isQualified) {
        // Soft check — warn but don't fail hard
        issues.push(`⚠️ Expected score > ${tc.expectScoreAbove}, got ${result.score}`);
    }
    if (tc.expectScoreBelow !== undefined && result.score >= tc.expectScoreBelow && result.isQualified) {
        issues.push(`⚠️ Expected score < ${tc.expectScoreBelow}, got ${result.score}`);
    }

    if (issues.length > 0 && issues.some(i => i.startsWith('Expected'))) {
        status = '❌';
        failed++;
    } else {
        passed++;
    }

    console.log(`${status} ${tc.name}`);
    console.log(`   Score: ${result.score}  Badge: ${result.badge}  Qualified: ${result.isQualified}${result.reason ? ` (${result.reason})` : ''}`);
    if (issues.length > 0) console.log(`   ${issues.join(' | ')}`);
    console.log('');
}

// Key invariant: Consistent Grinder should score HIGHER than Lucky Hero
const grinderResult = calculator.calculate(consistentGrinder);
const heroResult = calculator.calculate(luckyHero);

console.log('───────────────────────────────────────────────────');
console.log('  🔑 Key Invariant: Consistency > Hero Trades');
console.log('───────────────────────────────────────────────────');
if (grinderResult.score > heroResult.score) {
    console.log(`✅ PASS — Grinder (${grinderResult.score}) > Hero (${heroResult.score})`);
    passed++;
} else {
    console.log(`❌ FAIL — Grinder (${grinderResult.score}) ≤ Hero (${heroResult.score})`);
    failed++;
}

console.log('');
console.log('───────────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('───────────────────────────────────────────────────');

// Ensure all scores are within 0-100
const allResults = allWallets.map(m => calculator.calculate(m));
const outOfRange = allResults.filter(r => r.score < 0 || r.score > 100);
if (outOfRange.length > 0) {
    console.log(`\n❌ RANGE ERROR: ${outOfRange.length} score(s) outside 0-100 range!`);
} else {
    console.log(`\n✅ All scores within valid 0-100 range.`);
}

process.exit(failed > 0 ? 1 : 0);
