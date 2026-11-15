'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@prodlike/ui';
import { clientApi } from '@/lib/client-api';

const STEPS = [
  {
    title: 'Welcome to Prodlike',
    text: 'Each scenario drops you into a realistic codebase with a ticket. Your job: fix it, test it, ship it, and handle whatever breaks next.',
  },
  {
    title: 'Pick a scenario',
    text: 'Open Scenarios to browse by difficulty and skill. Every scenario starts with a brief that tells you exactly how you will be scored.',
  },
  {
    title: 'Fail safely, learn fast',
    text: 'Everything runs in a private sandbox, so nothing you do can break anything real. Retry as often as you like: your best score counts.',
  },
];

/** 3-step first-login tour (NFR-06). Finishing or skipping marks the user as onboarded. */
export function OnboardingTour() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
  }, [step]);

  async function finish() {
    setOpen(false);
    try {
      await clientApi('/auth/me/onboarded', { method: 'POST' });
    } finally {
      router.refresh();
    }
  }

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-secondary/55 p-4">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        onKeyDown={(e) => e.key === 'Escape' && finish()}
        className="w-full max-w-md rounded-lg bg-white p-7 shadow-2xl"
      >
        <p className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-2 text-2xl font-bold">
          {s.title}
        </h2>
        <p className="mt-2">{s.text}</p>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={finish}>
            Skip tour
          </Button>
          <Button onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? 'Start exploring' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
