const fetch = require('node-fetch');
require('dotenv').config();
const API_KEY = process.env.LP_AGENT_API_KEY || '';
const BASE = 'https://api.lpagent.io/open-api/v1';

async function main() {
    // Fetch a real active pool's top LPer and inspect their overview
    const poolsRes = await fetch(`${BASE}/pools/discover?chain=SOL&sortBy=vol_24h&sortOrder=desc&pageSize=5&type=meteora`, {
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    });
    const poolsJson = await poolsRes.json();
    const pools = (poolsJson.data || []).filter(p => {
        const proto = (p.protocol || p.dex || p.type || '').toLowerCase();
        return proto.includes('meteora') && !proto.includes('damm');
    });
    
    if (pools.length === 0) {
        console.log('No pools found');
        return;
    }
    
    const pool = pools[0];
    const poolId = pool.pool || pool.id || pool.address;
    console.log(`Pool: ${pool.name || pool.token0_symbol + '/' + pool.token1_symbol} (${poolId})`);
    
    await new Promise(r => setTimeout(r, 6500));
    
    const lpersRes = await fetch(`${BASE}/pools/${poolId}/top-lpers?limit=3`, {
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    });
    const lpersJson = await lpersRes.json();
    const lpers = lpersJson.data || [];
    
    if (lpers.length === 0) {
        console.log('No LPers found');
        return;
    }
    
    const owner = lpers[0].owner;
    console.log(`\nLPer owner: ${owner}`);
    
    await new Promise(r => setTimeout(r, 6500));
    
    const url = `${BASE}/lp-positions/overview?owner=${owner}&protocol=meteora`;
    console.log('Fetching:', url);
    
    const res = await fetch(url, {
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    });
    
    const json = await res.json();
    console.log('\nStatus:', json.status);
    console.log('Type of data:', typeof json.data);
    console.log('Is array:', Array.isArray(json.data));
    console.log('Array length:', json.data?.length);
    
    if (Array.isArray(json.data) && json.data.length > 0) {
        const d = json.data[0];
        console.log('\n=== Key fields from data[0] ===');
        console.log('total_lp:', d.total_lp, '(type:', typeof d.total_lp, ')');
        console.log('total_pool:', d.total_pool, '(type:', typeof d.total_pool, ')');
        console.log('win_rate:', JSON.stringify(d.win_rate));
        console.log('total_pnl:', JSON.stringify(d.total_pnl));
        console.log('total_fee:', JSON.stringify(d.total_fee));
        console.log('avg_inflow:', JSON.stringify(d.avg_inflow));
        console.log('closed_lp:', JSON.stringify(d.closed_lp));
        console.log('avg_age_hour:', d.avg_age_hour);
        console.log('avg_monthly_pnl:', d.avg_monthly_pnl);
        console.log('avg_pos_profit:', d.avg_pos_profit);
        console.log('last_activity:', d.last_activity);
    }
}

main().catch(e => console.error(e));
