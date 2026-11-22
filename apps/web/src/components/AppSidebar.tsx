import Link from 'next/link';
import type { Me, Role } from '@prodlike/shared';
import { Logo } from './Logo';

interface NavItem {
  href: string;
  label: string;
  /** Planned in a later phase: shown (so the structure is visible) but not linked. */
  soon?: string;
}

/** Role-based menus from the A2 sitemap (FR-02). */
const MENUS: Record<Exclude<Role, 'GUEST'>, NavItem[]> = {
  LEARNER: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/scenarios', label: 'Scenarios' },
    { href: '/progress', label: 'Progress History' },
    { href: '/settings', label: 'Profile & Settings' },
  ],
  INSTRUCTOR: [
    { href: '/instructor', label: 'Instructor Dashboard' },
    { href: '/scenarios', label: 'Scenarios' },
    { href: '/instructor/cohorts', label: 'Classes' },
    { href: '/instructor/reports', label: 'Learner Reports' },
    { href: '/instructor/builder', label: 'Scenario Builder' },
    { href: '/settings', label: 'Profile & Settings' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Publish scenarios' },
    { href: '/admin/users', label: 'Users & Roles' },
    { href: '/admin/sandboxes', label: 'Sandbox Health' },
    { href: '/scenarios', label: 'Scenarios' },
    { href: '/instructor', label: 'Instructor view' },
    { href: '/dashboard', label: 'Learner view' },
    { href: '/settings', label: 'Profile & Settings' },
  ],
};

export function AppSidebar({ me, active }: { me: Me; active: string }) {
  const items = MENUS[me.role === 'GUEST' ? 'LEARNER' : me.role];
  const initials = me.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <nav
      aria-label={`${me.role.toLowerCase()} navigation`}
      className="flex flex-col gap-1 bg-secondary px-3.5 py-5 text-slate-300 md:sticky md:top-0 md:h-screen"
    >
      <div className="px-2 pb-5">
        <Logo dark href="/" />
      </div>
      <div className="px-2.5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        {me.role.toLowerCase()}
      </div>
      {items.map((item) =>
        item.soon ? (
          <span
            key={item.href}
            className="flex items-center justify-between rounded-sm px-2.5 py-2 text-sm text-slate-400"
            title={`Coming in ${item.soon}`}
          >
            {item.label}
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold">soon</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.href === active ? 'page' : undefined}
            className={`rounded-sm px-2.5 py-2 text-sm font-medium hover:bg-slate-800 hover:text-white ${
              item.href === active ? 'bg-slate-800 text-white shadow-[inset_3px_0_0_#06B6D4]' : ''
            }`}
          >
            {item.label}
          </Link>
        ),
      )}
      <div className="mt-auto border-t border-slate-800 px-2.5 pt-3 text-[13px]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary text-[13px] font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{me.name}</div>
            <div className="truncate text-slate-400">{me.organisation ?? me.email}</div>
          </div>
        </div>
        <form action="/auth/logout" method="post" className="mt-3">
          <button type="submit" className="text-slate-400 hover:text-white">
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
