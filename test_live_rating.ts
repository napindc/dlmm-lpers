/**
 * E2E Test v2: Try overview with & without protocol filter,
 * and test a known active DLMM wallet from the docs example.
 * 
 * Run: npx ts-node test_live_rating_v2.ts
 */
const fetch = require('node-fetch');
import * as dotenv from 'dotenv';
import { WalletRatingCalculator, WalletMetrics } from './ratingCalculator';

dotenv.config();

const API_KEY = process.env.LP_AGENT_API_KEY || '';
const BASE_URL = 'https://api.lpagent.io/open-api/v1';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let lastReq = 0;
async function api(endpoint: string): Promise<any> {
    const elapsed = Date.now() - lastReq;
    if (elapsed < 6500) await sleep(6500 - elapsed);
    lastReq = Date.now();
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

async function fetchAndPrint(owner: string, label: string): Promise<WalletMetrics | null> {
    console.log(`\n   ⏳ [${label}] ${owner.slice(0,12)}...`);
    
    // Try with protocol=meteora first
    try {
        const res = await api(`/lp-positions/overview?owner=${owner}&protocol=meteora`);
        if (res?.status === 'success' && res.data) {
            // API returns data as an array — grab the first element
            const d = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!d) { console.log(`   ⚠️  Empty data array.`); return null; }
            const totalLp = parseInt(d.total_lp) || 0;
            
            if (totalLp > 0) {
                const closedLp1M = d.closed_lp?.['1M'] || 0;
                const closedLp7D = d.closed_lp?.['7D'] || 0;
                const winRateAll = (d.win_rate?.ALL || 0) * 100;
                const winRate1W = (d.win_rate?.['7D'] || 0) * 100;
                const winRate1M = (d.win_rate?.['1M'] || 0) * 100;
                const winRate3M = (d.win_rate?.['3M'] || 0) * 100;
                const totalPnlAll = d.total_pnl?.ALL || 0;
                const totalPnl7D = d.total_pnl?.['7D'] || 0;
                const totalPnl1M = d.total_pnl?.['1M'] || 0;
                const totalFeeAll = d.total_fee?.ALL || 0;
                const avgInflowAll = d.avg_inflow?.ALL || 0;
                const avgMonthlyPnl = d.avg_monthly_pnl || 0;
                const avgAgeHour = d.avg_age_hour || 0;
                const totalPool = parseInt(d.total_pool) || 0;
                const avgPosProfit = d.avg_pos_profit || 0;

                let lastActivityDaysAgo = 1;
                if (d.last_activity) {
                    const ms = Date.parse(d.last_activity);
                    if (!isNaN(ms)) lastActivityDaysAgo = Math.max(0, (Date.now() - ms) / 86400000);
                }

                const profitStability = avgInflowAll > 0 ? Math.min(1, Math.max(0, Math.abs(avgPosProfit) / avgInflowAll)) : 0;
                const pnl7dNorm = closedLp7D > 0 ? totalPnl7D / closedLp7D : 0;
                const pnl1mNorm = closedLp1M > 0 ? totalPnl1M / closedLp1M : 0;
                const variance = pnl1mNorm !== 0 ? Math.min(1, Math.abs((pnl7dNorm - pnl1mNorm) / Math.abs(pnl1mNorm))) : 0.5;

                console.log(`   ✅ ${totalLp} positions | ${winRateAll.toFixed(1)}% WR | ${totalPool} pools | Avg hold ${(avgAgeHour/24).toFixed(2)}d`);
                console.log(`      PnL ALL: $${totalPnlAll.toFixed(2)} | 30D: $${totalPnl1M.toFixed(2)} | 7D: $${totalPnl7D.toFixed(2)}`);
                console.log(`      Fees: $${totalFeeAll.toFixed(2)} | Monthly Avg: $${avgMonthlyPnl.toFixed(2)} | Last Active: ${lastActivityDaysAgo.toFixed(1)}d ago`);

                return {
                    totalPositions: totalLp, positions30D: closedLp1M,
                    profitPerPositionStability: profitStability, variance7Dvs30D: variance,
                    avgMonthlyProfit: avgMonthlyPnl, avgInvested: avgInflowAll,
                    totalProfit: totalPnlAll, profit7D: totalPnl7D, profit30D: totalPnl1M,
                    winRate1W, winRate1M, winRate3M, overallWinRate: winRateAll,
                    avgPositionAgeDays: avgAgeHour / 24, feesEarned: totalFeeAll,
                    totalPools: totalPool, lastActivityDaysAgo
                };
            } else {
                console.log(`   ⚠️  0 Meteora positions. Raw response keys: ${Object.keys(d).join(', ')}`);
                console.log(`      total_lp=${d.total_lp}, protocol=${d.protocol}`);
            }
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }
    return null;
}

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  🧪 Live Rating Test v3 — Finding Active Wallets');
    console.log('═══════════════════════════════════════════════════');

    const allMetrics: { owner: string; metrics: WalletMetrics }[] = [];
    const seenOwners = new Set<string>();

    // Scan multiple recent high-volume DLMM pools to find ACTIVE wallets
    console.log('\n── Discovering recent DLMM pools... ──');
    try {
        const poolsRes = await api('/pools/discover?chain=SOL&sortBy=vol_24h&sortOrder=desc&pageSize=20&type=meteora');
        let pools = (poolsRes.data || []).filter((p: any) => {
            const proto = (p.protocol || p.dex || p.type || '').toLowerCase();
            return proto.includes('meteora') && !proto.includes('damm');
        });

        // Pick up to 3 pools to scan
        const poolsToScan = pools.slice(0, 3);
        console.log(`   Found ${pools.length} DLMM pools, scanning top ${poolsToScan.length} for active LPers...\n`);

        for (const pool of poolsToScan) {
            const poolId = pool.pool || pool.id || pool.address;
            const pairName = pool.name || `${pool.token0_symbol}/${pool.token1_symbol}`;
            console.log(`\n── Pool: ${pairName} (${poolId.slice(0,12)}...) ──`);

            const lpersRes = await api(`/pools/${poolId}/top-lpers?limit=10`);
            const lpers = lpersRes.data || [];
            let foundInPool = 0;

            for (const lp of lpers) {
                if (foundInPool >= 3) break; // max 3 per pool
                const owner = lp.owner;
                if (!owner || seenOwners.has(owner)) continue;
                seenOwners.add(owner);

                const m = await fetchAndPrint(owner, pairName);
                if (m) {
                    allMetrics.push({ owner, metrics: m });
                    foundInPool++;
                }
            }

            if (foundInPool === 0) {
                console.log(`   ⚠️  No LPers with Meteora data in this pool.`);
            }
        }
    } catch (e: any) {
        console.log(`   ❌ Pool scan error: ${e.message}`);
    }

    // Run through rating calculator
    if (allMetrics.length === 0) {
        console.log('\n❌ No wallets with Meteora data found. Cannot calculate ratings.');
        return;
    }

    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  📊 Rating Calculator Results');
    console.log('═══════════════════════════════════════════════════\n');

    const calculator = new WalletRatingCalculator(allMetrics.map(m => m.metrics));

    let qualified = 0;
    let disqualified = 0;

    for (const { owner, metrics } of allMetrics) {
        const result = calculator.calculate(metrics);
        const short = `${owner.slice(0,6)}..${owner.slice(-4)}`;
        console.log(`${result.badge} [${short}] — Score: ${result.score}/100`);
        console.log(`   Qualified: ${result.isQualified}${result.reason ? ` (${result.reason})` : ''}`);
        console.log(`   Positions: ${metrics.totalPositions} | WinRate: ${metrics.overallWinRate.toFixed(1)}% | Pools: ${metrics.totalPools}`);
        console.log(`   PnL 30D: $${metrics.profit30D.toFixed(2)} | Total: $${metrics.totalProfit.toFixed(2)} | Fees: $${metrics.feesEarned.toFixed(2)}`);
        console.log(`   Last Active: ${metrics.lastActivityDaysAgo.toFixed(1)} days ago | 30D Positions: ${metrics.positions30D}`);
        console.log('');
        if (result.isQualified) qualified++; else disqualified++;
    }

    console.log('───────────────────────────────────────────────────');
    console.log(`  Summary: ${allMetrics.length} wallets scanned | ${qualified} qualified | ${disqualified} disqualified`);
    console.log('───────────────────────────────────────────────────');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
