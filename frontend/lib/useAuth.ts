'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { User, getStoredUser } from './users';

/**
 * Gate a page on a logged-in user. Redirects to /login?next=<current path>
 * when no session is present. Returns the user once known, or null while
 * resolving / redirecting.
 */
export function useRequireAuth(): User | null {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/login?next=${next}`);
      return;
    }
    setUser(current);
  }, [router, pathname]);

  return user;
}
