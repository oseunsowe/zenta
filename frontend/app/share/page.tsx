import SharePanel from '../../components/SharePanel';

export const dynamic = 'force-dynamic';

export default async function SharePage({ searchParams }: { searchParams: Promise<{ code?: string; session?: string }> }) {
  const { code, session } = await searchParams;
  return <SharePanel initialCode={code} sessionId={session} />;
}
