import { Card } from '@prodlike/ui';
import { AppSidebar } from '@/components/AppSidebar';

// Phase 0 shell only: authentication and real data arrive in Phase 1 (FR-01, FR-02).
export default function DashboardPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
      <AppSidebar role="LEARNER" active="/dashboard" userName="Demo Learner" />
      <main className="min-w-0 px-9 py-7">
        <p className="text-[13px] text-ink-muted">Learner</p>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Card className="mt-6">
          <p>This is the Phase 0 app shell. Sign-up, log-in and the scenario catalogue land in Phase 1.</p>
        </Card>
      </main>
    </div>
  );
}
