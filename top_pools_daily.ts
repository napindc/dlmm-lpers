import * as fs from 'fs';
const fetch = require('node-fetch');
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY: string | undefined = process.env.LP_AGENT_API_KEY || 'lpagent_27951b2e59d621bb2b0edea0586300f54cb7a9bad46dc0dc';
const WEBHOOK_URL: string | undefined = process.env.WEBHOOK_URL;
let BASE_URL: string = 'https://api.lpagent.io/open-api/v1';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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

    const POSTED_CACHE_FILE = 'posted_cache.json';
    let postedCache: Record<string, { pnl: string, pool: string, timestamp: number }> = {};
    if (fs.existsSync(POSTED_CACHE_FILE)) {
        try { postedCache = JSON.parse(fs.readFileSync(POSTED_CACHE_FILE, 'utf8')); } catch (e) {}
    }
    const savePostedCache = () => fs.writeFileSync(POSTED_CACHE_FILE, JSON.stringify(postedCache, null, 2));

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

            if (ageDays <= 1.5) {
                pools24h.push({ ...p, ageDays, originalAgeMs: ms });
            } else if (ageDays >= 3 && ageDays <= 7.5) {
                pools3to7d.push({ ...p, ageDays, originalAgeMs: ms });
            }
        }

        const top24h = pools24h.slice(0, 3);
        const top3to7d = pools3to7d.slice(0, 3);
        const seenWallets = new Set<string>();
        
        let fullSummaryData: Record<string, Record<string, string[]>> = {
            "Top wallets from pools < 24 hrs ago:": {},
            "Top wallets from pools < 3-7 days ago:": {}
        };

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
                const ageStr = `${Math.max(0, Math.floor(pool.ageDays || 0))} Days Old`;
                
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

                    if (seenWallets.has(owner)) {
                        console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> Already processed.`);
                        continue;
                    }
                    if (postedCache[owner] && Date.now() - postedCache[owner].timestamp < 24 * 60 * 60 * 1000) {
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

                            if (postedCache[owner] && postedCache[owner].pnl === cumulativePnl) {
                                console.log(`   [!] Skipped [${owner.slice(0,8)}...] -> PnL unchanged ($${cumulativePnl}).`);
                                postedCache[owner].timestamp = Date.now();
                                savePostedCache();
                                continue;
                            }
                            
                            console.log(`   [🏆] ELITE WHALE CONFIRMED [${owner.slice(0,8)}...] -> 30D PnL: $${cumulativePnl}! Generating QuickChart...`);
                            
                            const labels = days.map((d, i) => `D${i+1}`);
                            const profits = days.map(d => parseFloat((d.sum !== undefined ? d.sum : d.sum_native) as any));
                            const averageProfit = profits.length > 0 ? (profits.reduce((a, b) => a + b, 0) / profits.length).toFixed(2) : "0.00";
                            const pnl7d = profits.slice(-7).reduce((a, b) => a + b, 0).toFixed(2);

                            const MA_WINDOW = 7;
                            const movingAvg = profits.map((_, i) => {
                                const start = Math.max(0, i - MA_WINDOW + 1);
                                const windowSlice = profits.slice(start, i + 1);
                                return parseFloat((windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length).toFixed(2));
                            });

                            const quickChartObj = {
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [
                                        {
                                            type: 'line',
                                            label: '7-Day Moving Average',
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
                                }
                            };

                            const qcRes = await fetch('https://quickchart.io/chart/create', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ chart: quickChartObj, width: 600, height: 300, backgroundColor: 'white' })
                            });
                            const qcData: any = await qcRes.json();
                            const chartImageUrl = qcData.url || `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(quickChartObj))}`;

                            const discordPayload = {
                                embeds: [
                                    {
                                        title: `🎯 Top Performing LP: ${pairName}`,
                                        description: `**Wallet:** \`${owner}\`\n**Pool Category:** ${categoryName}\n**Pool Target:** ${pairName} [${ageStr}]\n**30D Cumulative PnL:** $${cumulativePnl}\n**7D PnL:** $${pnl7d}\n**Daily Average:** $${averageProfit}`,
                                        color: 16766720,
                                        image: { url: chartImageUrl }
                                    }
                                ],
                                components: [
                                    {
                                        type: 1,
                                        components: [
                                            {
                                                type: 2,
                                                label: "⭐ Follow on LP Agent",
                                                style: 5,
                                                url: `https://app.lpagent.io/portfolio/${owner}`
                                            },
                                            {
                                                type: 2,
                                                label: "🦊 Follow on Valhalla",
                                                style: 5,
                                                url: `https://valhalla.app/wallet/${owner}`
                                            },
                                            {
                                                type: 2,
                                                label: "🌊 View Meteora Pool",
                                                style: 5,
                                                url: `https://app.meteora.ag/dlmm/${poolId}`
                                            }
                                        ]
                                    }
                                ]
                            };

                            if (WEBHOOK_URL) {
                                await fetch(WEBHOOK_URL, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(discordPayload)
                                });
                                console.log(`   [✅] Successfully Posted ${pairName} Elite Whale Chart to Discord!`);
                                poolWhales.push(owner);
                                seenWallets.add(owner);
                                postedCache[owner] = { pnl: cumulativePnl, pool: pairName, timestamp: Date.now() };
                                savePostedCache();
                            }

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
        }

        await processCategory(top24h, "Best in Last 24H", "Top wallets from pools < 24 hrs ago:");
        await processCategory(top3to7d, "Best in Last 3-7 Days", "Top wallets from pools < 3-7 days ago:");

        console.log(`\n======================================================`);
        console.log(`Market Sweep Complete. Building Final Text Summary...`);
        console.log(`======================================================\n`);

        let summaryStr = "";

        if (Object.keys(fullSummaryData["Top wallets from pools < 24 hrs ago:"]).length > 0) {
            summaryStr += "**Top wallets from pools < 24 hrs ago:**\n";
            for (const [poolName, wallets] of Object.entries(fullSummaryData["Top wallets from pools < 24 hrs ago:"])) {
                summaryStr += `Pool ${poolName}:\n`;
                for (const w of wallets) {
                    summaryStr += `${w}\n`;
                }
                summaryStr += "\n";
            }
        }

        if (Object.keys(fullSummaryData["Top wallets from pools < 3-7 days ago:"]).length > 0) {
            summaryStr += "**Top wallets from pools < 3-7 days ago:**\n";
            for (const [poolName, wallets] of Object.entries(fullSummaryData["Top wallets from pools < 3-7 days ago:"])) {
                summaryStr += `Pool ${poolName}:\n`;
                for (const w of wallets) {
                    summaryStr += `${w}\n`;
                }
                summaryStr += "\n";
            }
        }

        if (summaryStr.length > 0 && WEBHOOK_URL) {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: summaryStr.trim() })
            });
            console.log(`   [✅] Successfully sent global Text Summary to Discord DMs!`);
        }

    } catch (err: any) {
        console.error("Critical Failure in Daily Sniper:", err.message);
    }
}

runDailySniper();
