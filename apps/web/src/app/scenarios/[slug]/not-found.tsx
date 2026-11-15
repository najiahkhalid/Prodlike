import Link from 'next/link';

export default function ScenarioNotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">Scenario not found</h1>
      <p className="mt-3 text-ink-muted">
        It may have been unpublished, or the link is wrong.{' '}
        <Link href="/scenarios" className="font-semibold text-primary">
          Back to the catalogue
        </Link>
      </p>
    </main>
  );
}
