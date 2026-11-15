import { Logo } from '../Logo';

/** Split-screen layout from the A2 prototype (login.html): story on the left, form on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-secondary p-12 text-slate-300 md:flex">
        <Logo dark />
        <div>
          <h2 className="text-3xl font-bold text-white">Practise the parts of the job nobody teaches.</h2>
          <div
            aria-hidden="true"
            className="mt-6 rounded border border-slate-800 bg-slate-950 p-5 font-mono text-[13px] leading-7 text-slate-400"
          >
            <div>
              <span className="text-accent-live">$</span> npm test
            </div>
            <div>
              <span className="text-ok-dark">✓</span> 14 passed{' '}
              <span className="text-bad-dark">✕ 1 failed</span>
            </div>
            <div>
              <span className="text-accent-live">$</span> git commit -m &quot;fix: discount boundary&quot;
            </div>
            <div>
              <span className="text-accent-live">$</span> deploy --strategy canary
            </div>
            <div className="text-bad-dark">⚠ payments-service 5xx 38%</div>
            <div>
              <span className="text-accent-live">$</span> rollback v1.4.1{' '}
              <span className="text-ok-dark">✓ service restored in 2m 04s</span>
            </div>
          </div>
        </div>
        <p className="text-sm">Fix it, test it, ship it, then handle what breaks. Safely.</p>
      </aside>
      <main className="grid place-items-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 md:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
