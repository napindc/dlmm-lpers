import { NextResponse } from 'next/server';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

export async function GET() {
  try {
    const walletsStr = await redis.get('dlmm:dashboard:wallets');
    const updatedAtStr = await redis.get('dlmm:dashboard:updated_at');

    const wallets = walletsStr ? JSON.parse(walletsStr) : [];
    const updatedAt = updatedAtStr ? parseInt(updatedAtStr, 10) : null;

    return NextResponse.json({ wallets, updatedAt });
  } catch (error: any) {
    console.error('Error fetching dashboard data from Redis:', error.message);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
