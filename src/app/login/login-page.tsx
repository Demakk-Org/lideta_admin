'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { LockClosedIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { NotAdminLoginError, loginWithEmail } from '@/lib/api/auth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const reason = useSearchParams().get('reason');

  useEffect(() => {
    // A fixed id keeps Strict Mode's double effect run from stacking toasts.
    if (reason === 'forbidden') {
      toast.error('This account does not have administrator access.', {
        id: 'login-reason',
      });
    } else if (reason === 'expired') {
      toast.error('Your session has expired. Please sign in again.', {
        id: 'login-reason',
      });
    }
  }, [reason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await loginWithEmail(email, password);
      router.push('/');
    } catch (err) {
      toast.error(
        err instanceof NotAdminLoginError
          ? 'This account does not have administrator access.'
          : err instanceof Error
            ? err.message
            : 'Failed to sign in. Please try again.',
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-brand-700 to-brand-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* The mark, blown up and barely visible, as the page's backdrop. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src="/logo.png"
          alt=""
          width={613}
          height={756}
          priority
          className="absolute -left-16 -bottom-20 w-[32rem] max-w-none opacity-[0.07] select-none"
        />
      </div>

      <div className="relative sm:mx-auto sm:w-full sm:max-w-md">
        {/* The mark is navy-on-transparent, so it needs a light chip to read
            against the navy backdrop. */}
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl bg-[#ffffff] shadow-xl">
          <Image
            src="/logo.png"
            alt="Lideta Mekane Yesus church logo"
            width={613}
            height={756}
            priority
            className="h-20 w-auto"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-[#ffffff]">
          Admin Dashboard
        </h2>
        <p className="mt-2 text-center text-sm text-[#ffffff]/70">
          Sign in to your admin account
        </p>
      </div>

      <div className="relative mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-primary-800">
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon className="h-5 w-5 text-primary-400" aria-hidden="true" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-primary-300 rounded-md py-2 border"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-primary-800">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-primary-400" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-primary-300 rounded-md py-2 border"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-primary-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-primary-800">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-primary-600 hover:text-primary-500">
                  Forgot your password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-[#ffffff] bg-brand-700 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
