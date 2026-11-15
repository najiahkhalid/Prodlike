'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@prodlike/ui';
import { ClientApiError, clientApi } from '@/lib/client-api';

export function PublishToggle({ slug, published }: { slug: string; published: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    setBusy(true);
    setError(undefined);
    try {
      await clientApi(`/admin/scenarios/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !published }),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant={published ? 'secondary' : 'primary'} onClick={toggle} disabled={busy}>
        {published ? 'Unpublish' : 'Publish'}
      </Button>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
