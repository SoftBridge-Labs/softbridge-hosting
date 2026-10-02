export interface DeploymentRecord {
  deploymentId: string;
  userId: string;
  projectName: string;
  subdomain: string;
  plan: 'free' | 'premium';
  status: 'pending' | 'deploying' | 'active' | 'failed' | 'deleted';
  createdAt: string;
  updatedAt: string;
  lastDeployedAt: string;
}

let kvInstance: any = null;

export async function getKv() {
  if (!kvInstance) {
    // @ts-ignore
    kvInstance = await Deno.openKv();
  }
  return kvInstance;
}
