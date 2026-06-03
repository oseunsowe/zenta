import ViewPanel from '../../components/ViewPanel';

export const dynamic = 'force-dynamic';

export default async function ViewPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { session } = await searchParams;
  return <ViewPanel sessionId={session} />;
}
