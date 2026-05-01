# 🐋 Elite Whale Sniper — Meteora DLMM Pool Scanner

An automated intelligence bot that discovers top-performing Meteora DLMM liquidity pools on Solana, identifies the most profitable whale wallets providing liquidity in those pools, and delivers rich analytics reports directly to Discord.

## What It Does

Once a day, the bot automatically scans the Solana Meteora DLMM ecosystem and delivers actionable whale intelligence to your Discord:

- **Finds the top wallets from the 1–3 best-performing pools created in the last 24 hours**
- **Finds the top wallets from the 1–3 best-performing pools aged 3–7 days**
- **Shows a link to view each wallet on [LP Agent](https://lpagent.io)**
- **Shows a link to follow each wallet on [Valhalla](https://valhalla.app)**
- **Shows a link to the pool on [Meteora](https://app.meteora.ag)**

### How It Works

1. **Discovers Hot Pools** — Fetches the top 100 Meteora DLMM pools sorted by 24h volume via the [LP Agent API](https://lpagent.io)
2. **Applies Hardcoded Pair Bans** — Skips banned pair names before any whale analysis. The current hardcoded bans are `SOL/USDC` and `CBBTC/USDC`.
3. **Filters by Age** — Separates pools into two categories:
   - 🔥 **Fresh pools** created in the last 24 hours
   - 📊 **Established pools** aged 3–7 days
4. **Identifies Elite Whales** — For the top 3 pools in each category, it pulls the top liquidity providers and evaluates their 30-day PnL across all Meteora positions
5. **Filters Out Losers** — Only wallets with a positive 30-day cumulative PnL survive the filter
6. **Generates Visual Reports** — Creates a bar chart with daily PnL and a 7-day moving average via [QuickChart](https://quickchart.io)
7. **Posts to Discord** — Sends a rich embed to your Discord channel with:
   - Wallet address
   - Pool name and precise age (e.g. `14h 2m`)
   - 30D cumulative PnL, 7D PnL, and daily average
   - Interactive PnL chart
   - Quick links to LP Agent, Valhalla, and the Meteora pool
8. **Deduplicates via Redis** — Tracks posted wallets in Redis to avoid spamming Discord with duplicate reports. Entries auto-expire after 3 days.

## Example Discord Output

Each whale report includes:
- 📊 A PnL bar chart with a 7-day moving average trendline
- 💰 Key metrics: 30D PnL, 7D PnL, Daily Average
- 🔗 Quick links to LP Agent, Valhalla, and the Meteora pool

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [PM2](https://pm2.keymetrics.io/) (for automated daily scheduling)
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

### Automated every-2-day runs with PM2

The included `ecosystem.config.json` is pre-configured to run the script at midnight every 2 days:

```bash
# Install PM2 globally (if not already installed)
npm install -g pm2

# Start the scheduled bot
pm2 start ecosystem.config.json

# Check status
pm2 status

# View logs
pm2 logs Elite-Whale-Sniper

# Stop the bot
pm2 stop Elite-Whale-Sniper
```

The PM2 config (`ecosystem.config.json`) includes:
- **Cron schedule:** `0 0 */2 * *` (runs at midnight every 2 days)
- **Auto-restart:** Disabled (runs once per trigger, not continuously)
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
