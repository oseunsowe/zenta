import MobileView from '../../components/MobileView';

export const dynamic = 'force-dynamic';

export default async function MobileViewPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <MobileView initialCode={code} />;
}
