'use client';

import { useEffect, useState, useMemo } from 'react';

type RatingBreakdown = {
  consistency: number;
  roi: number;
  recentPerformance: number;
  winRateQuality: number;
  positionManagement: number;
  feeGeneration: number;
};

type RatingResult = {
  score: number;
  badge: string;
  isQualified: boolean;
  reason?: string;
  breakdown?: RatingBreakdown;
};

type WalletMetrics = {
  totalPositions: number;
  positions30D: number;
  overallWinRate: number;
  totalProfit: number;
  profit30D: number;
  profit7D: number;
  feesEarned: number;
  lastActivityDaysAgo: number;
  avgPositionAgeDays: number;
  totalPools: number;
};

type WalletData = {
  owner: string;
  pool: string;
  poolId: string;
  metrics: WalletMetrics;
  rating: RatingResult;
  pnl30dStr: string;
  pnl7dStr: string;
  avgDailyStr: string;
};

type SortKey = 
  | 'rating' 
  | 'winRate' 
  | 'totalProfit' 
  | 'profit30D' 
  | 'profit7D' 
  | 'fees' 
  | 'positions' 
  | 'lastActive';

export default function Dashboard() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/wallets')
      .then((res) => res.json())
      .then((data) => {
        setWallets(data.wallets || []);
        setUpdatedAt(data.updatedAt);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc'); // Default to desc when changing columns
    }
  };

  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      let valA: number;
      let valB: number;

      switch (sortKey) {
        case 'rating':
          valA = a.rating.isQualified ? a.rating.score : -1;
          valB = b.rating.isQualified ? b.rating.score : -1;
          break;
        case 'winRate':
          valA = a.metrics.overallWinRate;
          valB = b.metrics.overallWinRate;
          break;
        case 'totalProfit':
          valA = a.metrics.totalProfit;
          valB = b.metrics.totalProfit;
          break;
        case 'profit30D':
          valA = a.metrics.profit30D;
          valB = b.metrics.profit30D;
          break;
        case 'profit7D':
          valA = a.metrics.profit7D;
          valB = b.metrics.profit7D;
          break;
        case 'fees':
          valA = a.metrics.feesEarned;
          valB = b.metrics.feesEarned;
          break;
        case 'positions':
          valA = a.metrics.totalPositions;
          valB = b.metrics.totalPositions;
          break;
        case 'lastActive':
          // For last active, smaller is better, so we invert logic for simple generic sort
          valA = -a.metrics.lastActivityDaysAgo;
          valB = -b.metrics.lastActivityDaysAgo;
          break;
        default:
          valA = 0;
          valB = 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [wallets, sortKey, sortOrder]);

  const getBadgeClass = (score: number, isQualified: boolean) => {
    if (!isQualified) return 'badge-gray';
    if (score >= 80) return 'badge-green';
    if (score >= 65) return 'badge-yellow';
    return 'badge-red';
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const formatTimeAgo = (daysAgo: number) => {
    if (daysAgo < 1 / 24) {
      const mins = Math.max(1, Math.round(daysAgo * 24 * 60));
      return `${mins}m ago`;
    }
    if (daysAgo < 1) {
      const hrs = Math.round(daysAgo * 24);
      return `${hrs}h ago`;
    }
    return `${daysAgo.toFixed(1)}d ago`;
  };

  if (loading) {
    return <div className="loading">Loading dashboard data...</div>;
  }

  return (
    <div className="container">
      <header className="header">
        <div className="title-section">
          <h1>Meteora DLMM Elite Wallets</h1>
          <p className="subtitle">Real-time performance metrics and consistency ratings for top liquidity providers.</p>
        </div>
        {updatedAt && (
          <div className="timestamp">
            Last Updated: {new Date(updatedAt).toLocaleString()}
          </div>
        )}
      </header>

      {wallets.length === 0 ? (
        <div className="empty-state">
          No wallet data available. The daily sniper script needs to run to populate the dashboard.
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Pool</th>
                <th 
                  className={`sortable ${sortKey === 'rating' ? 'active' : ''}`}
                  onClick={() => handleSort('rating')}
                >
                  Rating Index {sortKey === 'rating' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'winRate' ? 'active' : ''}`}
                  onClick={() => handleSort('winRate')}
                >
                  Win Rate {sortKey === 'winRate' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'totalProfit' ? 'active' : ''}`}
                  onClick={() => handleSort('totalProfit')}
                >
                  Total Profit {sortKey === 'totalProfit' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'profit30D' ? 'active' : ''}`}
                  onClick={() => handleSort('profit30D')}
                >
                  30D Profit {sortKey === 'profit30D' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'profit7D' ? 'active' : ''}`}
                  onClick={() => handleSort('profit7D')}
                >
                  7D Profit {sortKey === 'profit7D' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'fees' ? 'active' : ''}`}
                  onClick={() => handleSort('fees')}
                >
                  Fees {sortKey === 'fees' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'positions' ? 'active' : ''}`}
                  onClick={() => handleSort('positions')}
                >
                  Positions {sortKey === 'positions' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className={`sortable ${sortKey === 'lastActive' ? 'active' : ''}`}
                  onClick={() => handleSort('lastActive')}
                >
                  Last Active {sortKey === 'lastActive' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedWallets.map((w, i) => (
                <tr key={`${w.owner}-${i}`}>
                  <td>
                    <a 
                      href={`https://app.lpagent.io/portfolio?address=${w.owner}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="wallet-link"
                    >
                      {formatAddress(w.owner)}
                    </a>
                  </td>
                  <td>
                    <a 
                      href={`https://app.meteora.ag/dlmm/${w.poolId}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="pool-link"
                    >
                      {w.pool}
                    </a>
                  </td>
                  <td>
                    {w.rating.isQualified ? (
                      <div className="tooltip-container">
                        <span className={`badge ${getBadgeClass(w.rating.score, true)}`}>
                          {w.rating.score} / 100
                        </span>
                        <div className="tooltip">
                          <div className="tooltip-title">Score Breakdown</div>
                          <div className="tooltip-row">
                            <span>Consistency:</span>
                            <span>{w.rating.breakdown?.consistency || 0}/100</span>
                          </div>
                          <div className="tooltip-row">
                            <span>ROI:</span>
                            <span>{w.rating.breakdown?.roi || 0}/100</span>
                          </div>
                          <div className="tooltip-row">
                            <span>Recent Perf:</span>
                            <span>{w.rating.breakdown?.recentPerformance || 0}/100</span>
                          </div>
                          <div className="tooltip-row">
                            <span>Win Rate Quality:</span>
                            <span>{w.rating.breakdown?.winRateQuality || 0}/100</span>
                          </div>
                          <div className="tooltip-row">
                            <span>Position Mgmt:</span>
                            <span>{w.rating.breakdown?.positionManagement || 0}/100</span>
                          </div>
                          <div className="tooltip-row">
                            <span>Fees/Activity:</span>
                            <span>{w.rating.breakdown?.feeGeneration || 0}/100</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="tooltip-container">
                        <span className="badge badge-gray">N/A</span>
                        <div className="tooltip">
                          <div className="tooltip-title">Not Qualified</div>
                          <div className="tooltip-row">
                            <span>Reason:</span>
                            <span>{w.rating.reason}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td>{w.metrics.overallWinRate.toFixed(1)}%</td>
                  <td className={w.metrics.totalProfit >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(w.metrics.totalProfit)}
                  </td>
                  <td className={w.metrics.profit30D >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(w.metrics.profit30D)}
                  </td>
                  <td className={w.metrics.profit7D >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(w.metrics.profit7D)}
                  </td>
                  <td>{formatCurrency(w.metrics.feesEarned)}</td>
                  <td>{w.metrics.totalPositions}</td>
                  <td>{formatTimeAgo(w.metrics.lastActivityDaysAgo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          font-size: 1.2rem;
          color: var(--text-secondary);
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-color);
        }
        
        .title-section h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          background: linear-gradient(90deg, #fff, #a0a5b1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
          color: var(--text-secondary);
          font-size: 1rem;
        }
        
        .timestamp {
          color: var(--text-secondary);
          font-size: 0.875rem;
          background: rgba(255,255,255,0.05);
          padding: 0.5rem 1rem;
          border-radius: 9999px;
        }

        .empty-state {
          background: var(--bg-card);
          padding: 3rem;
          border-radius: 12px;
          text-align: center;
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }
        
        .table-container {
          background: var(--bg-card);
          border-radius: 12px;
          overflow-x: auto;
          border: 1px solid var(--border-color);
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        
        .data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        
        .data-table th, .data-table td {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
          white-space: nowrap;
        }
        
        .data-table th {
          color: var(--text-secondary);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
          background: rgba(255,255,255,0.02);
        }
        
        .data-table tbody tr:last-child td {
          border-bottom: none;
        }
        
        .data-table tbody tr:hover {
          background: rgba(255,255,255,0.02);
        }
        
        .sortable {
          cursor: pointer;
          user-select: none;
          transition: color 0.2s;
        }
        
        .sortable:hover {
          color: var(--text-primary);
        }
        
        .sortable.active {
          color: var(--accent-blue);
        }
        
        .wallet-link {
          color: var(--text-primary);
          font-weight: 500;
          transition: color 0.2s;
        }
        
        .wallet-link:hover {
          color: var(--accent-blue);
          text-decoration: underline;
        }
        
        .pool-link {
          color: var(--text-secondary);
          transition: color 0.2s;
        }
        
        .pool-link:hover {
          color: var(--text-primary);
        }
        
        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
          display: inline-block;
        }
        
        .badge-green { background: var(--badge-green-bg); color: var(--badge-green-text); }
        .badge-yellow { background: var(--badge-yellow-bg); color: var(--badge-yellow-text); }
        .badge-red { background: var(--badge-red-bg); color: var(--badge-red-text); }
        .badge-gray { background: var(--badge-gray-bg); color: var(--badge-gray-text); font-weight: 400; }
        
        .positive { color: #34d399; }
        .negative { color: #f87171; }
        
        /* Tooltip styling */
        .tooltip-container {
          position: relative;
          display: inline-block;
          cursor: help;
        }
        
        .tooltip {
          visibility: hidden;
          background-color: #2e323e;
          color: #fff;
          text-align: left;
          border-radius: 8px;
          padding: 1rem;
          position: absolute;
          z-index: 10;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 0.2s;
          width: 220px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.1);
        }
        
        .tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 6px;
          border-style: solid;
          border-color: #2e323e transparent transparent transparent;
        }
        
        .tooltip-container:hover .tooltip {
          visibility: visible;
          opacity: 1;
        }
        
        .tooltip-title {
          font-weight: 600;
          margin-bottom: 0.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          font-size: 0.875rem;
        }
        
        .tooltip-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.25rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        
        .tooltip-row span:last-child {
          color: var(--text-primary);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
