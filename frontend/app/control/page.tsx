import MobileControl from '../../components/MobileControl';

export const dynamic = 'force-dynamic';

export default async function ControlPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <MobileControl initialCode={code} />;
}
