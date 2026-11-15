import Link from 'next/link';

export function Logo({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 font-head text-xl font-bold ${dark ? 'text-white' : 'text-ink'}`}
    >
      <span
        className={`grid h-[30px] w-[30px] place-items-center rounded-[8px] ${dark ? 'bg-primary' : 'bg-secondary'}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 17l6-6-6-6" />
          <path d="M12 19h8" />
        </svg>
      </span>
      Prodlike
    </Link>
  );
}
