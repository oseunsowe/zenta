import { Suspense } from 'react';

import UserLogin from '../../components/UserLogin';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-viewport" />}>
      <UserLogin />
    </Suspense>
  );
}
