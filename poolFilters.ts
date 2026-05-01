const BANNED_PAIR_NAMES = new Set([
    'SOL/USDC',
    'CBBTC/USDC'
]);

function normalizeTokenSymbol(value: string): string {
    return value.trim().toUpperCase();
}

export function normalizePairName(value: string): string {
    const trimmed = value.trim();
    const parts = trimmed.split(/\s*[\/-]\s*/).filter(Boolean);

    if (parts.length === 2) {
        return `${normalizeTokenSymbol(parts[0])}/${normalizeTokenSymbol(parts[1])}`;
    }

    return trimmed.toUpperCase();
}

export function isBannedPairName(value: string): boolean {
    return BANNED_PAIR_NAMES.has(normalizePairName(value));
}

export function getBannedPoolPairName(pool: {
    name?: string;
    token0_symbol?: string;
    token1_symbol?: string;
}): string | null {
    if (pool.token0_symbol && pool.token1_symbol) {
        const derivedPairName = `${pool.token0_symbol}/${pool.token1_symbol}`;
        if (isBannedPairName(derivedPairName)) {
            return normalizePairName(derivedPairName);
        }
    }

    if (pool.name && isBannedPairName(pool.name)) {
        return normalizePairName(pool.name);
    }

    return null;
}
