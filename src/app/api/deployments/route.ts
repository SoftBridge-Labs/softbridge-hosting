import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getKv } from '@/lib/db';

export async function GET(req: NextRequest) {
  const uid = await authenticateRequest(req);
  if (!uid) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const kv = await getKv();
    const deployments = [];
    
    const iter = kv.list({ prefix: ['deployments_by_user', uid] });
    for await (const entry of iter) {
      deployments.push(entry.value);
    }
    
    return NextResponse.json({ success: true, deployments });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
}
