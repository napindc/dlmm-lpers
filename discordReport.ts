import { fmtSol } from './formatting';

export const VALHALLA_INTRO = 'Below are profitable Meteora wallets you can copy trade with Valhalla! To begin just type in Discord here "/valhalla start"';

export function formatWalletChartLabel(owner: string): string {
    return `${owner.slice(0, 6)},,,${owner.slice(-4)}`;
}

export function buildWalletChartTitle(_pairName: string, owner: string, totalSol: number): string {
    return `${formatWalletChartLabel(owner)} · ${fmtSol(totalSol)} total`;
}

export function buildCategoryWebhookContent(categoryName: string, description: string, intro?: string): string {
    const heading = `**🔍 ${categoryName}**`;
    return intro ? `${intro}\n${heading}\n${description}` : `${heading}\n${description}`;
}
