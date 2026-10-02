import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params;
    if (!subdomain) {
      return NextResponse.json({ success: false, error: 'Missing subdomain' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { subdomain },
    });

    if (!site) {
      return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      subdomain: site.subdomain,
      userId: site.userId,
      projectName: site.projectName,
      plan: site.plan,
      html: site.html || "",
      css: site.css || "",
      js: site.js || ""
    });

  } catch (err: any) {
    console.error('Fetch site code error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
