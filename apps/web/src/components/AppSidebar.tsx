import Link from 'next/link';
import { Logo } from './Logo';

export type AppRole = 'LEARNER' | 'INSTRUCTOR' | 'ADMIN';

interface NavItem {
  href: string;
  label: string;
}

/** Role-based menus from the A2 sitemap (FR-02). Pages arrive in later phases. */
const MENUS: Record<AppRole, NavItem[]> = {
  LEARNER: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/scenarios', label: 'Scenarios' },
    { href: '/progress', label: 'Progress History' },
    { href: '/settings', label: 'Profile & Settings' },
  ],
  INSTRUCTOR: [
    { href: '/instructor', label: 'Instructor Dashboard' },
    { href: '/instructor/cohorts', label: 'Cohorts' },
    { href: '/instructor/builder', label: 'Scenario Builder' },
    { href: '/instructor/reports', label: 'Learner Reports' },
    { href: '/settings', label: 'Account Settings' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Admin' },
    { href: '/admin/users', label: 'Users & Roles' },
    { href: '/admin/scenarios', label: 'Scenarios' },
    { href: '/admin/sandboxes', label: 'Sandbox Health' },
  ],
};

export function AppSidebar({ role, active, userName }: { role: AppRole; active: string; userName: string }) {
  return (
    <nav
      aria-label={`${role.toLowerCase()} navigation`}
      className="sticky top-0 flex h-screen flex-col gap-1 bg-secondary px-3.5 py-5 text-slate-300"
    >
      <div className="px-2 pb-5">
        <Logo dark href="/dashboard" />
      </div>
      <div className="px-2.5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {role.toLowerCase()}
      </div>
      {MENUS[role].map((item) => {
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-sm px-2.5 py-2 text-sm font-medium hover:bg-slate-800 hover:text-white ${
              on ? 'bg-slate-800 text-white shadow-[inset_3px_0_0_#06B6D4]' : ''
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto flex items-center gap-2.5 border-t border-slate-800 px-2.5 pt-3 text-[13px]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[13px] font-semibold text-white">
          {userName
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)}
        </span>
        <span className="font-semibold text-white">{userName}</span>
      </div>
    </nav>
  );
}
