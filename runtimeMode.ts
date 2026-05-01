export type RuntimeMode = 'scheduled' | 'run-now';

export function getRuntimeMode(flag: string | undefined): RuntimeMode {
    if (flag === '1' || flag === 'true') {
        return 'run-now';
    }

    return 'scheduled';
}
