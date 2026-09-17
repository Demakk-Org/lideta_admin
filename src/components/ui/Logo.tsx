import Image from 'next/image';

/**
 * The church mark from `public/logo.png`. Kept in one place so the sidebar,
 * the login screen and the watermark all stay in sync if the file is replaced.
 */
export default function Logo({
  size = 40,
  className = '',
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src='/logo.png'
      alt='Lideta Mekane Yesus church logo'
      width={size}
      height={Math.round((size * 756) / 613)}
      priority={priority}
      className={className}
    />
  );
}

/**
 * Oversized, heavily faded mark used as a page backdrop. `aria-hidden` and
 * `pointer-events-none` keep it out of the accessibility tree and off clicks.
 */
export function LogoWatermark({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden='true'
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <Image
        src='/logo.png'
        alt=''
        width={613}
        height={756}
        className='absolute -right-24 -bottom-24 w-[32rem] max-w-none opacity-[0.04] select-none'
      />
    </div>
  );
}
