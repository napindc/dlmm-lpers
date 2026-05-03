# 🐋 Elite Whale Sniper — Meteora DLMM Pool Scanner

An automated intelligence bot that discovers top-performing Meteora DLMM liquidity pools on Solana, identifies the most profitable whale wallets providing liquidity in those pools, and delivers rich analytics reports directly to Discord.

## What It Does

Every 3 days, the bot automatically scans the Solana Meteora DLMM ecosystem and delivers actionable whale intelligence to your Discord:

- **First sends the top wallets from the 1–3 best-performing pools less than 3 days old**
- **Then sends the top wallets from the 1–3 best-performing pools aged 3–300 days**
- **Shows a link to view each wallet on [LP Agent](https://lpagent.io)**
- **Shows a link to follow each wallet on [Valhalla](https://valhalla.app)**
- **Shows a link to the pool on [Meteora](https://app.meteora.ag)**

### How It Works

1. **Discovers Hot Pools** — Fetches the top 100 Meteora DLMM pools sorted by 24h volume via the [LP Agent API](https://lpagent.io)
2. **Applies Hardcoded Pair Bans** — Skips banned pair names before any whale analysis. The current hardcoded bans are `SOL/USDC` and `CBBTC/USDC`.
3. **Filters by Age** — Separates pools into two categories:
   - 🔥 **Fresh pools** less than 3 days old
   - 📊 **Established pools** aged 3–300 days
4. **Measures Wallet SOL Exposure** — Combines native SOL balance with the SOL-equivalent `valueNative` of the wallet's open Meteora LP positions
5. **Identifies Elite Whales** — For the top 3 pools in each category, it pulls the top liquidity providers and evaluates their 30-day PnL across all Meteora positions
6. **Filters Out Losers** — Only wallets with a positive 30-day cumulative PnL survive the filter
7. **Generates Visual Reports** — Creates a bar chart with daily PnL and a 7-day moving average via [QuickChart](https://quickchart.io)
8. **Posts to Discord** — Sends a rich embed to your Discord channel with:
   - Wallet address
   - Total SOL exposure (native SOL + open LP position value)
   - Pool name and precise age (e.g. `14h 2m`)
   - 30D cumulative PnL, 7D PnL, and daily average
   - Interactive PnL chart
   - Quick links to LP Agent, Valhalla, and the Meteora pool
9. **Deduplicates via Redis** — Tracks posted wallets in Redis to avoid spamming Discord with duplicate reports. Entries auto-expire after 3 days.

## Example Discord Output

Each whale report includes:
- 📊 A PnL bar chart with a 7-day moving average trendline
- 💰 Key metrics: 30D PnL, 7D PnL, Daily Average
- 🔗 Quick links to LP Agent, Valhalla, and the Meteora pool

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [PM2](https://pm2.keymetrics.io/) (for scheduled reports)
- A free [LP Agent API key](https://lpagent.io)
- A [Discord Webhook URL](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
- A [Redis instance](#redis-setup) (e.g. free tier on [Upstash](https://upstash.com))

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/dlmm-ext.git
cd dlmm-ext
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
LP_AGENT_API_KEY=your_lp_agent_api_key
WEBHOOK_URL=https://discord.com/api/webhooks/your/webhook/url
REDIS_URL=rediss://default:your-password@your-region.upstash.io:6379
```

| Variable | Description | Required |
|---|---|---|
| `LP_AGENT_API_KEY` | Your LP Agent API key for accessing pool and wallet data | ✅ |
| `WEBHOOK_URL` | Discord webhook URL for the channel you want reports sent to | ✅ |
| `REDIS_URL` | Redis connection string for deduplication cache | ✅ |

### Redis Setup

The bot uses Redis to remember which wallets have already been posted to avoid duplicates. We recommend [Upstash](https://upstash.com) (free tier):

1. Sign up at [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Copy the **Redis URL** from the dashboard
4. Paste it into your `.env` as `REDIS_URL`

Cached wallet entries auto-expire after 3 days — no maintenance needed.


---

## Running the Script

### One-time manual run

```bash
npx ts-node top_pools_daily.ts
```

### One-time live run right now

```bash
RUN_NOW=1 npx ts-node top_pools_daily.ts
```

### Automated every-3-day runs with PM2

The included `ecosystem.config.json` runs the `dlmm-lpers` process continuously. In scheduled mode, the script waits until the next midnight, sends the first report for pools less than 3 days old, then runs every 3 days:

```bash
# Install PM2 globally (if not already installed)
npm install -g pm2

# Start the scheduled bot
pm2 start ecosystem.config.json

# Check status
pm2 status

# View logs
pm2 logs dlmm-lpers

# Stop the bot
pm2 stop dlmm-lpers
```

The PM2 config (`ecosystem.config.json`) includes:
- **Process name:** `dlmm-lpers`
- **Schedule cadence:** first run at next midnight, then every 72 hours
- **Auto-restart:** Enabled so the scheduler restarts if the process exits unexpectedly
- **Log files:** Saved to `./logs/` directory

---

## Project Structure

```
dlmm-ext/
├── top_pools_daily.ts      # Main bot script
├── ecosystem.config.json   # PM2 configuration for scheduling
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript configuration
├── .env                    # Environment variables (not committed)
├── .env.example            # Template for environment variables
├── .gitignore              # Git ignore rules
└── logs/                   # PM2 log output directory
```

---

## Rate Limiting

The LP Agent API enforces a **10 requests per minute** limit. The bot handles this by:
- Enforcing a minimum 6.1-second delay between all API calls
- Automatically retrying failed requests up to 3 times with 10-second backoffs
- Cooling down for 30 seconds if a 429 (rate limit) response is received

---

## License

MIT
