export interface WalletMetrics {
    totalPositions: number;
    positions30D: number;
    profitPerPositionStability: number; // 0-1 (higher is more stable)
    variance7Dvs30D: number; // 0-1 (lower is better, meaning consistent)
    avgMonthlyProfit: number;
    avgInvested: number;
    totalProfit: number;
    profit7D: number;
    profit30D: number;
    winRate1W: number; // 0-100
    winRate1M: number; // 0-100
    winRate3M: number; // 0-100
    overallWinRate: number; // 0-100
    avgPositionAgeDays: number;
    feesEarned: number;
    totalPools: number;
    lastActivityDaysAgo: number;
}

export interface RatingBreakdown {
    consistency: number;
    roi: number;
    recentPerformance: number;
    winRateQuality: number;
    positionManagement: number;
    feeGeneration: number;
}

export interface RatingResult {
    score: number;
    badge: string;
    isQualified: boolean;
    reason?: string;
    breakdown?: RatingBreakdown;
}

function normalize(value: number, min: number, max: number): number {
    if (max === min) return 50;
    let score = ((value - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, score));
}

function normalizeInverse(value: number, min: number, max: number): number {
    return 100 - normalize(value, min, max);
}

export class WalletRatingCalculator {
    private baselineMin: Partial<WalletMetrics> = {};
    private baselineMax: Partial<WalletMetrics> = {};

    constructor(populationMetrics: WalletMetrics[]) {
        this.computeBaselines(populationMetrics);
    }

    private computeBaselines(population: WalletMetrics[]) {
        if (!population || population.length === 0) return;
        
        const keys = Object.keys(population[0]) as (keyof WalletMetrics)[];
        
        for (const key of keys) {
            let min = Number.MAX_VALUE;
            let max = Number.MIN_VALUE;
            
            for (const metrics of population) {
                const val = metrics[key];
                if (val < min) min = val;
                if (val > max) max = val;
            }
            this.baselineMin[key] = min;
            this.baselineMax[key] = max;
        }
    }

    public calculate(metrics: WalletMetrics): RatingResult {
        // 3. Qualification Criteria
        if (metrics.totalPositions < 75) {
            return { score: 0, badge: '⚪', isQualified: false, reason: 'Total Positions < 75' };
        }
        if (metrics.lastActivityDaysAgo > 8 && metrics.positions30D < 1) {
            return { score: 0, badge: '⚪', isQualified: false, reason: 'No recent activity (last 8 days or 30 days)' };
        }

        // Helper to get normalized value for a metric
        const getNorm = (key: keyof WalletMetrics, inverse = false) => {
            const val = metrics[key];
            const min = this.baselineMin[key] || 0;
            const max = this.baselineMax[key] || val;
            return inverse ? normalizeInverse(val, min, max) : normalize(val, min, max);
        };

        // 1. Consistency & Volume (30%)
        // Rewards high number of trades + stable profit + low variance
        const consScore = (
            getNorm('totalPositions') * 0.25 +
            getNorm('positions30D') * 0.25 +
            normalize(metrics.profitPerPositionStability, 0, 1) * 0.25 +
            normalizeInverse(metrics.variance7Dvs30D, 0, 1) * 0.25
        );

        // 2. Long-term Profitability (ROI) (25%)
        const avgMonthlyRoi = metrics.avgInvested > 0 ? (metrics.avgMonthlyProfit / metrics.avgInvested) : 0;
        const totalRoi = metrics.avgInvested > 0 ? (metrics.totalProfit / metrics.avgInvested) : 0;
        const profitPerPos = metrics.totalPositions > 0 ? (metrics.totalProfit / metrics.totalPositions) : 0;

        // ROI ceilings tuned for realistic DLMM returns
        const roiScore = (
            normalize(avgMonthlyRoi, 0, 0.5) * 0.40 + // 50% monthly ROI is elite
            normalize(totalRoi, 0, 3) * 0.40 +         // 300% total ROI is elite
            getNorm('totalProfit') * 0.20
        );

        // 3. Recent Performance (20%)
        // Win rates are already 0-100, so the weighted average is already on the right scale
        const recentWinRate = (metrics.winRate1W * 0.4 + metrics.winRate1M * 0.4 + metrics.winRate3M * 0.2);
        const recentPerfScore = (
            getNorm('profit7D') * 0.25 +
            getNorm('profit30D') * 0.25 +
            recentWinRate * 0.50
        );

        // 4. Win Rate Quality (15%)
        // Overall Win Rate + multiplier based on Total Positions
        let winRateMultiplier = 1.0;
        if (metrics.totalPositions > 1000) winRateMultiplier = 1.2;
        else if (metrics.totalPositions > 500) winRateMultiplier = 1.1;
        
        let winRateQualityScore = metrics.overallWinRate * winRateMultiplier;
        winRateQualityScore = Math.min(100, Math.max(0, winRateQualityScore));

        // 5. Position Management (5%)
        // Hold time adjusted by volume. High volume -> prefer shorter holds. Low volume -> can hold longer.
        let posMgmtScore = 50;
        const avgHoldDays = metrics.avgPositionAgeDays;
        if (metrics.positions30D > 100) {
            // High volume - prefers < 1 day
            posMgmtScore = avgHoldDays < 1 ? 100 : normalizeInverse(avgHoldDays, 1, 7);
        } else {
            // Low volume - prefers 3-14 days
            posMgmtScore = (avgHoldDays >= 3 && avgHoldDays <= 14) ? 100 : 50;
        }

        // 6. Fee Generation & Activity (5%)
        const feeRatio = metrics.totalProfit > 0 ? (metrics.feesEarned / metrics.totalProfit) : 0;
        const feeScore = (
            normalize(feeRatio, 0, 1) * 0.40 +
            getNorm('totalPools') * 0.30 +
            getNorm('lastActivityDaysAgo', true) * 0.30
        );

        // Calculate final weighted score
        const finalScore = (
            (consScore * 0.30) +
            (roiScore * 0.25) +
            (recentPerfScore * 0.20) +
            (winRateQualityScore * 0.15) +
            (posMgmtScore * 0.05) +
            (feeScore * 0.05)
        );

        const score = Math.round(Math.max(0, Math.min(100, finalScore)));
        
        let badge = '🔴';
        if (score >= 80) badge = '🟢';
        else if (score >= 65) badge = '🟡';

        return {
            score, badge, isQualified: true,
            breakdown: {
                consistency: Math.round(consScore),
                roi: Math.round(roiScore),
                recentPerformance: Math.round(recentPerfScore),
                winRateQuality: Math.round(winRateQualityScore),
                positionManagement: Math.round(posMgmtScore),
                feeGeneration: Math.round(feeScore)
            }
        };
    }
}
