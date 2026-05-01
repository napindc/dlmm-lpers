export interface OpenLpPositionLike {
    valueNative?: number | string | null;
}

export function sumOpenPositionValueNative(positions: OpenLpPositionLike[]): number {
    return positions.reduce((total, position) => {
        const raw = position.valueNative;
        const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : 0;
        return Number.isFinite(parsed) ? total + parsed : total;
    }, 0);
}

export function computeTotalSolExposure(nativeSol: number, positions: OpenLpPositionLike[]): number {
    return nativeSol + sumOpenPositionValueNative(positions);
}
