import { NextRequest, NextResponse } from 'next/server';
import { getKv, DeploymentRecord } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { subdomain: string } }) {
  try {
    const kv = await getKv();
    const entry = await kv.get(['deployments_by_subdomain', params.subdomain]);
    const deployment = entry.value as DeploymentRecord | null;
    
    if (!deployment || deployment.status !== 'active') {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found' } }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      deploymentId: deployment.deploymentId,
      userId: deployment.userId,
      projectName: deployment.projectName,
      subdomain: deployment.subdomain,
      plan: deployment.plan
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, { status: 500 });
  }
}
