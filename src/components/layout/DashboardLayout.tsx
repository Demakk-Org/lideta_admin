'use client';

import Image from 'next/image';
import Sidebar from './Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // `isolate` keeps the backdrop's negative z-index from escaping this
    // subtree: it paints above this element's own background but below every
    // child, so nothing here needs to be lifted above it.
    <div className="relative isolate flex min-h-screen bg-primary-50">
      {/* Branded backdrop: the mark sits behind the content, faint enough that
          text contrast is untouched, and fixed so it does not scroll away. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <Image
          src="/logo.png"
          alt=""
          width={613}
          height={756}
          priority={false}
          className="absolute -right-32 bottom-0 w-[42rem] max-w-none opacity-[0.035] select-none"
        />
      </div>
      {/* Static sidebar for desktop */}
      <div className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:pl-64">
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
