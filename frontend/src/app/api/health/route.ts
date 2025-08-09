import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // バックエンドAPIのヘルスチェック
    const backendHealth = await fetch('http://localhost:3000/api/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => null);

    const response = {
      status: 'ok',
      frontend: {
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      },
      backend: backendHealth ? {
        status: 'connected',
        response: await backendHealth.json(),
      } : {
        status: 'disconnected',
        error: 'Backend API is not available',
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
