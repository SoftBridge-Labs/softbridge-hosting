import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/postgres';

export async function GET(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params;
    if (!subdomain) {
      return NextResponse.json({ success: false, error: 'Missing subdomain' }, { status: 400 });
    }

    const { rows } = await pool.query('SELECT * FROM "Site" WHERE subdomain = $1', [subdomain]);
    const site = rows[0];

    if (!site) {
      return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });
    }

    if (site.status === 'suspended') {
      return NextResponse.json({
        success: true,
        subdomain: site.subdomain,
        userId: site.userId,
        projectName: site.projectName,
        plan: site.plan,
        html: `<!DOCTYPE html><html><head><title>Site Disabled</title><style>body{margin:0;background-color:#f7fafc;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;padding:20px;}h1{color:#e53e3e;margin-bottom:16px;}p{font-size:18px;color:#4a5568;}a{color:#3182ce;text-decoration:none;}a:hover{text-decoration:underline;}</style></head><body><div><h1>Site Disabled</h1><p>SoftBridge Labs has disabled this site. If you think this is an error, please email us at <a href="mailto:support@softbridgelbs.in">support@softbridgelbs.in</a>.</p></div></body></html>`,
        css: "",
        js: "",
        files: []
      });
    }

    return NextResponse.json({
      success: true,
      subdomain: site.subdomain,
      userId: site.userId,
      projectName: site.projectName,
      plan: site.plan,
      html: site.html || "",
      css: site.css || "",
      js: site.js || "",
      files: site.files || []
    });

  } catch (err: any) {
    console.error('Fetch site code error', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
