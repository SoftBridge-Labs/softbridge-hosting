import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getKv, DeploymentRecord } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const uid = await authenticateRequest(req);
  if (!uid) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const kv = await getKv();
    const entry = await kv.get(['deployments_by_id', params.id]);
    const deployment = entry.value as DeploymentRecord | null;
    
    if (!deployment || deployment.userId !== uid) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found' } }, { status: 404 });
    }

    deployment.lastDeployedAt = new Date().toISOString();
    
    await kv.atomic()
      .set(['deployments_by_subdomain', deployment.subdomain], deployment)
      .set(['deployments_by_user', uid, params.id], deployment)
      .set(['deployments_by_id', params.id], deployment)
      .commit();

    return NextResponse.json({ success: true, message: 'Redeployed successfully', deploymentId: deployment.deploymentId });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
}
