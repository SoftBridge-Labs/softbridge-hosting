export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>SoftBridge Hosting API</h1>
      <p>Version 3.0.0-nextjs</p>
      <p>Deployment ID: {process.env.DENO_DEPLOYMENT_ID || 'local'}</p>
      <p>Status: online</p>
      <p>If you see this, you are hitting the Next.js server!</p>
    </div>
  );
}
