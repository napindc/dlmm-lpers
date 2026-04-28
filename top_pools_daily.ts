const fetch = require('node-fetch');
import * as dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const API_KEY: string | undefined = process.env.LP_AGENT_API_KEY || 'lpagent_27951b2e59d621bb2b0edea0586300f54cb7a9bad46dc0dc';
const WEBHOOK_URL: string | undefined = process.env.WEBHOOK_URL;
const REDIS_URL: string = process.env.REDIS_URL || 'redis://localhost:6379';
let BASE_URL: string = 'https://api.lpagent.io/open-api/v1';

const redis = new Redis(REDIS_URL);
const CACHE_PREFIX = 'dlmm:posted:';
const CACHE_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days — Redis auto-expires old entries

const SOLANA_RPC_URL: string = 'https://api.mainnet-beta.solana.com';
const MIN_SOL_BALANCE: number = 5; // Filter out wallets with less than 5 SOL

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Format PnL: absolute value, commas, no decimals, with up/down emoji
function fmtPnl(value: number): string {
    const emoji = value >= 0 ? '📈' : '📉';
    const abs = Math.abs(Math.round(value));
    const formatted = abs.toLocaleString('en-US');
    return `${emoji} $${formatted}`;
}

async function getWalletSolBalance(walletAddress: string): Promise<number> {
    try {
        const res = await fetch(SOLANA_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [walletAddress]
            })
        });
        const data: any = await res.json();
        // Convert lamports to SOL (1 SOL = 1e9 lamports)
        return (data?.result?.value || 0) / 1e9;
    } catch (e) {
        return 0; // On error, treat as 0 balance
    }
}

// Global rate limiter to ensure we NEVER burst past 10 RPM (1 request per 6 seconds)
let lastRequestTime: number = 0;
const MIN_DELAY_MS: number = 6100;

interface ApiOptions {
    method?: string;
    body?: any;
}

async function apiClient(endpoint: string, options: ApiOptions = {}): Promise<any> {
    const timeSinceLast = Date.now() - lastRequestTime;
    if (timeSinceLast < MIN_DELAY_MS) {
        await sleep(MIN_DELAY_MS - timeSinceLast);
    }

    const url = `${BASE_URL}${endpoint}`;
    let res: Response | null = null;
    
    // 3-Attempt Retry Logic
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            lastRequestTime = Date.now();
            res = await fetch(url, {
                method: options.method || 'GET',
                headers: { 'x-api-key': API_KEY || '', 'Content-Type': 'application/json' },
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            break; 
        } catch (err: any) {
            console.log(`   [!] Network drop on attempt ${attempt}. Retrying in 10s...`);
            if (attempt === 3) throw err;
            await sleep(10000);
        }
    }

    if (!res || !res.ok) {
        const errorText = await res!.text();
        if (res!.status === 429) {
            console.log(`   [!] Hit 429 Rate Limit. Cooling down for 30 seconds...`);
            await sleep(30000);
            throw new Error(`Rate Limit Exceeded (429)`);
        }
        throw new Error(`API error ${res!.status}: ${errorText}`);
    }
    return res.json();
}

interface PoolData {
    pool?: string;
    id?: string;
    address?: string;
    poolId?: string;
    name?: string;
    token0_symbol?: string;
    token1_symbol?: string;
    token0?: string;
    token1?: string;
    protocol?: string;
    dex?: string;
    source?: string;
    type?: string;
    created_at?: string;
    createdAt?: string;
    open_time?: string;
    ageDays?: number;
    originalAgeMs?: number;
}

interface LperData {
    owner?: string;
    address?: string;
    wallet?: string;
    user?: string;
}

interface PnlDay {
    cumulative_pnl?: number | string;
    cumulative_pnl_native?: number | string;
    sum?: number;
    sum_native?: number;
}

async function runDailySniper(): Promise<void> {
    console.log("======================================================");
    console.log("🚀 STARTING ADVANCED DAILY POOLS SNIPER (10 RPM OPTIMIZED)");
    console.log("======================================================\n");

    // Redis cache helper functions
    async function getCachedWallet(owner: string): Promise<{ pnl: string, pool: string, timestamp: number } | null> {
        const raw = await redis.get(`${CACHE_PREFIX}${owner}`);
        return raw ? JSON.parse(raw) : null;
    }
    async function setCachedWallet(owner: string, data: { pnl: string, pool: string, timestamp: number }): Promise<void> {
        await redis.set(`${CACHE_PREFIX}${owner}`, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    }

    try {
        console.log("0. Probing for active LP Agent API route...");
        const possibleUrls = [
            'https://api.lpagent.io/open-api/v1',
            'https://api.lpagent.io/v1',
            'https://api.lpagent.io/api/v1'
        ];
        
        let foundUrl = false;
        for (const testUrl of possibleUrls) {
            try {
                const probe = await fetch(`${testUrl}/pools/discover?pageSize=1`, { headers: { 'x-api-key': API_KEY || '' } });
                if (probe.ok) {
                    BASE_URL = testUrl;
                    foundUrl = true;
                    console.log(`   [✅] API Route acquired: ${BASE_URL}\n`);
                    break;
                }
            } catch(e: any) {
                console.log(`   [!] Probe error on ${testUrl}: ${e.message}`);
            }
        }
        
        if (!foundUrl) throw new Error("LP Agent servers are completely unreachable right now. Try again later.");

        console.log("1. Fetching Top DLMM Pools...");
        let poolsObj: any;
        try {
            poolsObj = await apiClient('/pools/discover?chain=SOL&sortBy=vol_24h&sortOrder=desc&pageSize=100&type=meteora');
        } catch(e) {
            console.log("\n   [WARNING] API Fetch Failed, falling back to smaller page size...");
            await sleep(6500);
            poolsObj = await apiClient('/pools/discover?chain=SOL&sortBy=vol_24h&sortOrder=desc&pageSize=50&type=meteora');
        }

        let pools: PoolData[] = poolsObj.data || poolsObj || [];
        
        pools = pools.filter(p => {
            const proto = (p.protocol || p.dex || p.source || p.type || "").toLowerCase();
            return !proto.includes('damm');
        });

        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;

        let pools24h: PoolData[] = [];
        let pools3to7d: PoolData[] = [];

        for (const p of pools) {
            let ts = p.created_at || p.createdAt || p.open_time;
            if (!ts) continue;
            let ms = typeof ts === 'string' ? Date.parse(ts) : (ts as unknown as number);
            if (ms > 0 && ms < 10000000000) ms *= 1000;
            let ageDays = (now - ms) / dayMs;

            if (ageDays <= 2) {
                pools24h.push({ ...p, ageDays, originalAgeMs: ms });
            } else {
                pools3to7d.push({ ...p, ageDays, originalAgeMs: ms });
            }
        }

        const top24h = pools24h.slice(0, 3);
        const top3to7d = pools3to7d.slice(0, 3);
        const seenWallets = new Set<string>();
        
        let fullSummaryData: Record<string, Record<string, string[]>> = {
            "Top wallets from pools < 2 days ago:": {},
            "Top wallets from pools 2+ days ago (by 24h volume):": {}
        };

        // Collect whale data per category — grouped text + chart files
        let pendingPools: Map<string, {
            poolId: string; pairName: string; ageStr: string;
            whales: { owner: string; pnl: string; pnl7d: string; avg: string; chartUrl: string; chartLabel: string }[];
        }> = new Map();

        async function flushEmbeds(categoryName: string) {
            if (pendingPools.size === 0 || !WEBHOOK_URL) return;

            // Build grouped text description
            const sections: string[] = [];
            const chartEntries: { label: string; url: string }[] = [];

            for (const [, pool] of pendingPools) {
                let section = `\n🎯 **[${pool.pairName}](<https://app.meteora.ag/dlmm/${pool.poolId}>)** [${pool.ageStr}]`;
                for (const w of pool.whales) {
                    section += `\n└ 👤 ${w.owner}`;
                    section += `\n\u2003 30D ${w.pnl}  ·  7D ${w.pnl7d}  ·  30D Avg Daily PnL ${w.avg}`;
                    chartEntries.push({ label: w.chartLabel, url: w.chartUrl });
                }
                sections.push(section);
            }

            const description = sections.join('\n');

            // Download chart images as file attachments (tiled grid in Discord)
            const fileBuffers: { name: string; buffer: Buffer }[] = [];
            for (const chart of chartEntries) {
                try {
                    const imgRes = await fetch(chart.url);
                    const arrBuf = await imgRes.arrayBuffer();
                    fileBuffers.push({ name: `${chart.label}.png`, buffer: Buffer.from(arrBuf) });
                } catch(e) {
                    console.log(`   [!] Failed to download chart for ${chart.label}`);
                }
            }

            // Send as multipart with one embed + file attachments
            const boundary = '----WhaleSniper' + Date.now();
            const parts: Buffer[] = [];

            const payload = JSON.stringify({
                content: `**🔍 ${categoryName}**\n${description}`
            });
            parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${payload}\r\n`
            ));

            for (let i = 0; i < fileBuffers.length; i++) {
                parts.push(Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="${fileBuffers[i].name}"\r\nContent-Type: image/png\r\n\r\n`
                ));
                parts.push(fileBuffers[i].buffer);
                parts.push(Buffer.from('\r\n'));
            }

            parts.push(Buffer.from(`--${boundary}--\r\n`));
            const body = Buffer.concat(parts);

            await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body: body
            });

            console.log(`   [✅] Sent message for "${categoryName}" — ${pendingPools.size} pool(s), ${chartEntries.length} chart(s).`);
            pendingPools = new Map();
        }

        async function processCategory(targetPools: PoolData[], categoryName: string, summaryKey: string) {
            if (targetPools.length === 0) {
                 console.log(`\n   [!] No Meteora pools were found for "${categoryName}".`);
                 return;
            }

            console.log(`\n===========================================`);
            console.log(`   SCANNING CATEGORY: ${categoryName}`);
            console.log(`===========================================\n`);

            for (const pool of targetPools) {
                const poolId = pool.pool || pool.id || pool.address || pool.poolId || 'UnknownPoolID';
                
                let t0 = pool.token0_symbol;
                let t1 = pool.token1_symbol;

                // DexScreener Fallback for Missing Pool Names
                if (!pool.name && (!t0 || !t1)) {
                    try {
                        let dexRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${poolId}`);
                        if (dexRes.ok) {
                            let dexData: any = await dexRes.json();
                            if (dexData.pairs && dexData.pairs.length > 0) {
                                t0 = t0 || dexData.pairs[0].baseToken.symbol;
                                t1 = t1 || dexData.pairs[0].quoteToken.symbol;
                            }
                        }
                    } catch(e) {}
                }

                if (!t0) t0 = pool.token0 ? `${pool.token0.slice(0,4)}..${pool.token0.slice(-4)}` : 'Unknown';
                if (!t1) t1 = pool.token1 ? `${pool.token1.slice(0,4)}..${pool.token1.slice(-4)}` : 'Unknown';

                const pairName = pool.name || `${t0}/${t1}`;
                const ageMs = (pool.ageDays || 0) * 24 * 60 * 60 * 1000;
                const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
                const ageHours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const ageMinutes = Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000));
                const ageStr = ageDays > 0 
                    ? `${ageDays}d ${ageHours}h` 
                    : `${ageHours}h ${ageMinutes}m`;
                
                console.log(`\n🌊 TARGET POOL: ${pairName} [${ageStr}] (${poolId})`);
                console.log(`   [⏳] Waiting 6.5s for 10 RPM limit to fetch LPers...`);
                await sleep(6500);

                let lpersRes: any;
                try {
                    lpersRes = await apiClient(`/pools/${poolId}/top-lpers?limit=50`);
                } catch(e: any) {
                    console.log(`   [!] Failed to pull LPers for ${pairName}: ${e.message}`);
                    continue;
                }

                const lpers: LperData[] = lpersRes.data || lpersRes;
                let poolWhales: string[] = [];

                for (const lper of lpers.slice(0, 5)) {
                    if (poolWhales.length >= 3) break; 

                    const owner = lper.owner || lper.address || lper.wallet || lper.user;
                    if (!owner) continue;

                    // Filter out wallets with less than 5 SOL
                    const solBalance = await getWalletSolBalance(owner);
                    if (solBalance < MIN_SOL_BALANCE) {
                        console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> Only ${solBalance.toFixed(2)} SOL (min: ${MIN_SOL_BALANCE}).`);
                        continue;
                    }

                    if (seenWallets.has(owner)) {
                        console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> Already processed.`);
                        continue;
                    }
                    const cached = await getCachedWallet(owner);
                    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
                        console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> Already posted to Discord today.`);
                        continue;
                    }

                    console.log(`   [⏳] Whale Found [${owner.slice(0,8)}...]. Fetching 30D PnL (6.5s delay)...`);
                    await sleep(6500);

                    try {
                        const profData = await apiClient(`/lp-positions/revenue/${owner}?range=1M&period=day&protocol=meteora`);
                        
                        if (profData?.status === "success" && Array.isArray(profData.data) && profData.data.length > 0) {
                            const days: PnlDay[] = profData.data.slice(-30);
                            const lastDay = days[days.length - 1];
                            const cumulativeRaw = lastDay.cumulative_pnl ?? lastDay.cumulative_pnl_native ?? 0;
                            const cumulativePnl = parseFloat(cumulativeRaw as string).toFixed(2);
                            
                            if (parseFloat(cumulativePnl) < 0) {
                                console.log(`   [!] Filtered OUT [${owner.slice(0,8)}...] -> Negative 30D PnL ($${cumulativePnl}).`);
                                continue;
                            }

                            if (cached && cached.pnl === cumulativePnl) {
                                console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> PnL unchanged ($${cumulativePnl}).`);
                                await setCachedWallet(owner, { ...cached, timestamp: Date.now() });
                                continue;
                            }
                            
                            console.log(`   [🏆] ELITE WHALE CONFIRMED [${owner.slice(0,8)}...] -> 30D PnL: $${cumulativePnl}! Generating QuickChart...`);
                            
                            const labels = days.map((d, i) => `D${i+1}`);
                            const rawProfits = days.map(d => parseFloat((d.sum !== undefined ? d.sum : d.sum_native) as any));
                            const profits = rawProfits.map(p => Math.round(p)); 
                            const averageProfitNum = rawProfits.length > 0 ? (rawProfits.reduce((a, b) => a + b, 0) / rawProfits.length) : 0;
                            const pnl7dNum = rawProfits.slice(-7).reduce((a, b) => a + b, 0);

                            const fmtCumulativePnl = fmtPnl(parseFloat(cumulativePnl));
                            const fmtPnl7d = fmtPnl(pnl7dNum);
                            const fmtAvgProfit = fmtPnl(averageProfitNum);

                            const MA_WINDOW = 7;
                            const movingAvg = rawProfits.map((_, i) => {
                                const start = Math.max(0, i - MA_WINDOW + 1);
                                const windowSlice = rawProfits.slice(start, i + 1);
                                return Math.round(windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length);
                            });

                            const shortWalletLabel = `${owner.slice(0, 6)}..${owner.slice(-4)}`;

                            const quickChartObj = {
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [
                                        {
                                            type: 'line',
                                            label: '7-Day Moving Avg PnL ($)',
                                            data: movingAvg,
                                            borderColor: 'rgb(255, 206, 86)',
                                            borderWidth: 2,
                                            fill: false,
                                            pointRadius: 0,
                                            tension: 0.3
                                        },
                                        {
                                            type: 'bar',
                                            label: 'Daily PnL ($)',
                                            data: profits,
                                            backgroundColor: profits.map(p => p >= 0 ? 'rgb(75, 192, 192)' : 'rgb(255, 99, 132)'),
                                            borderWidth: 1
                                        }
                                    ]
                                },
                                options: {
                                    title: {
                                        display: true,
                                        text: `${pairName} — ${shortWalletLabel}`,
                                        fontSize: 14
                                    },
                                    scales: {
                                        y: {
                                            ticks: {
                                                callback: '__CALLBACK__'
                                            }
                                        }
                                    }
                                }
                            };

                            // QuickChart needs the callback as a raw JS function string, not JSON
                            const chartString = JSON.stringify(quickChartObj).replace(
                                '"__CALLBACK__"',
                                '(val) => "$" + Math.round(val)'
                            );

                            const qcRes = await fetch('https://quickchart.io/chart/create', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ chart: chartString, width: 500, height: 200, backgroundColor: 'white' })
                            });
                            const qcData: any = await qcRes.json();
                            const chartImageUrl = qcData.url || `https://quickchart.io/chart?c=${encodeURIComponent(chartString)}`;

                            // Queue whale under its pool for grouped output
                            if (!pendingPools.has(poolId)) {
                                pendingPools.set(poolId, { poolId, pairName, ageStr, whales: [] });
                            }
                            const shortLabel = `${pairName.replace(/[^a-zA-Z0-9]/g, '_')}_${owner.slice(0, 8)}`;
                            pendingPools.get(poolId)!.whales.push({
                                owner, pnl: fmtCumulativePnl, pnl7d: fmtPnl7d, avg: fmtAvgProfit,
                                chartUrl: chartImageUrl, chartLabel: shortLabel
                            });

                            poolWhales.push(owner);
                            seenWallets.add(owner);
                            await setCachedWallet(owner, { pnl: cumulativePnl, pool: pairName, timestamp: Date.now() });
                            console.log(`   [✅] Queued embed for ${pairName} whale [${owner.slice(0,8)}...]`);

                        } else {
                            console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> No revenue data.`);
                        }
                    } catch (e: any) {
                        console.log(`   [!] Failed to evaluate whale [${owner.slice(0,8)}...]: ${e.message}`);
                    }
                }

                if (poolWhales.length === 0) {
                    console.log(`   [!] Scanned LPers for ${pairName} but none survived the PnL Filter.`);
                } else {
                    fullSummaryData[summaryKey][pairName] = poolWhales;
                }
            }

            // Flush all collected embeds for this category as ONE message
            await flushEmbeds(categoryName);
        }

        if (WEBHOOK_URL) {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: 'Below are profitable Meteora wallets you can copy trade with Valhalla! To begin just type in Discord here "/valhalla start"'
                })
            });
        }

        await processCategory(top24h, "Best in Last 2 Days", "Top wallets from pools < 2 days ago:");
        await processCategory(top3to7d, "Best Older Pools (2+ Days, Ranked by 24H Volume)", "Top wallets from pools 2+ days ago (by 24h volume):");

        console.log(`\n======================================================`);
        console.log(`Market Sweep Complete.`);
        console.log(`======================================================\n`);

    } catch (err: any) {
        console.error("Critical Failure in Daily Sniper:", err.message);
    }
}

function getNextMidnightMs(): number {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.getTime();
}

async function main(): Promise<void> {
    const nextMidnight = getNextMidnightMs();
    const hoursUntil = Math.round((nextMidnight - Date.now()) / 3600000);
    console.log(`🐋 Whale Sniper started. First run at: ${new Date(nextMidnight).toISOString()} (~${hoursUntil}h from now)`);
    await sleep(nextMidnight - Date.now());

    while (true) {
        await runDailySniper();
        console.log("⏰ Next run in 48 hours...");
        await sleep(48 * 60 * 60 * 1000);
    }
}

process.on('SIGTERM', async () => { await redis.quit(); process.exit(0); });
process.on('SIGINT', async () => { await redis.quit(); process.exit(0); });

main();
