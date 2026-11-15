import Link from 'next/link';
import { buttonClasses } from '@prodlike/ui';
import { Logo } from './Logo';

export function PublicNav() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-20 border-b border-surface-border bg-white/90 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-7 px-6">
        <Logo />
        <div className="hidden gap-6 text-[15px] font-medium md:flex">
          <a href="#how" className="hover:text-primary">
            How It Works
          </a>
          <a href="#scenarios" className="hover:text-primary">
            Scenarios
          </a>
          <a href="#instructors" className="hover:text-primary">
            For Instructors
          </a>
        </div>
        <div className="flex-1" />
        <Link href="/login" className={buttonClasses('ghost')}>
          Log in
        </Link>
        <Link href="/signup" className={buttonClasses('primary')}>
          Sign up free
        </Link>
      </div>
    </nav>
  );
}
