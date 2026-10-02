import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    version: "3.0.0-nextjs",
    deploymentId: process.env.DENO_DEPLOYMENT_ID || "local"
  });
}
