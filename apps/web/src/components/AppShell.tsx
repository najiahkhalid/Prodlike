import type { Me } from '@prodlike/shared';
import { AppSidebar } from './AppSidebar';

/** Layout for every signed-in page: role sidebar + main column. */
export function AppShell({
  me,
  active,
  crumbs,
  title,
  actions,
  children,
}: {
  me: Me;
  active: string;
  crumbs?: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
      {/* The column is navy full-height; the sidebar inside stays pinned while the page scrolls. */}
      <div className="bg-secondary">
        <AppSidebar me={me} active={active} />
      </div>
      <main className="min-w-0 px-4 py-7 md:px-9">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            {crumbs && <div className="mb-1.5 text-[13px] text-ink-muted">{crumbs}</div>}
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

/** Shown when the middleware redirected someone away from a page their role cannot open. */
export function DeniedNotice({ path }: { path?: string }) {
  if (!path) return null;
  return (
    <p
      role="alert"
      className="mb-5 rounded-sm border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn-text"
    >
      <b>Your account does not have access to {path}.</b> You have been brought to your own dashboard instead.
    </p>
  );
}
