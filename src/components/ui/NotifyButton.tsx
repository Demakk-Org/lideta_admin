'use client';

import { BellIcon } from '@heroicons/react/24/outline';

type Props = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
};

/** Bell button that broadcasts a "new content" notification to all users. */
export default function NotifyButton({
  onClick,
  disabled,
  className = '',
  title = 'Send notification',
}: Props) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center rounded-md border border-primary-300 bg-white px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title={title}
      aria-label={title}
    >
      <BellIcon className='h-4 w-4' />
    </button>
  );
}
