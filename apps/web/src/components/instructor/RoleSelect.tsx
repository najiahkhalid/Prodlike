'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ASSIGNABLE_ROLES } from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';

/** Change a user's role (FR-20). Their sessions are revoked so the new role applies at once. */
export function RoleSelect({
  userId,
  role,
  name,
  self,
}: {
  userId: string;
  role: string;
  name: string;
  self: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div>
      <select
        aria-label={`Role for ${name}`}
        className="field-input w-36 py-1.5 text-sm"
        value={role}
        disabled={busy || self}
        title={self ? 'You cannot change your own role' : undefined}
        onChange={async (e) => {
          const next = e.target.value;
          if (!confirm(`Make ${name} ${next.toLowerCase()}? They will be signed out of their sessions.`))
            return;
          setBusy(true);
          setError(undefined);
          try {
            await clientApi(`/admin/users/${userId}/role`, {
              method: 'PATCH',
              body: JSON.stringify({ role: next }),
            });
            router.refresh();
          } catch (err) {
            setError(err instanceof ClientApiError ? err.message : 'Could not change the role.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {r.charAt(0) + r.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
