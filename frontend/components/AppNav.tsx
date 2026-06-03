'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { User, logout } from '../lib/users';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/requests', label: 'Requests' },
  { href: '/account', label: 'Account' },
];

export default function AppNav({ user, incomingCount = 0 }: { user: User; incomingCount?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function signOut() {
    logout();
    router.replace('/login');
  }

  const initial = (user.username || '?').charAt(0).toUpperCase();

  return (
    <header className="topbar">
      <Link href="/" className="topbar__brand" aria-label="Zenta home">
        <span className="brand-logo">Z</span>
        <span>Zenta</span>
      </Link>

      <nav className="topbar__nav" aria-label="Primary">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="navlink"
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
            {link.href === '/requests' && incomingCount > 0 ? (
              <span className="navlink__badge">{incomingCount}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="usermenu" ref={menuRef}>
        <button
          type="button"
          className="usermenu__trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="avatar-chip">{initial}</span>
          <span className="usermenu__name">{user.username}</span>
          <span className="usermenu__caret">▾</span>
        </button>

        {open ? (
          <div className="usermenu__pop" role="menu">
            <div className="usermenu__meta">
              <div className="usermenu__name">{user.username}</div>
              <small>Signed in</small>
            </div>
            <Link href="/account" role="menuitem" className="menuitem" onClick={() => setOpen(false)}>
              Account &amp; password
            </Link>
            <button type="button" role="menuitem" className="menuitem menuitem--danger" onClick={signOut}>
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
