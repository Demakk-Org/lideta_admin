'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UsersIcon,
  UserGroupIcon,
  ArrowLeftOnRectangleIcon,
  BookOpenIcon,
  NewspaperIcon,
  CalendarDaysIcon,
  SpeakerWaveIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  AcademicCapIcon,
  Squares2X2Icon,
  FlagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { signOutUser } from '@/lib/api/auth';
import ThemeToggle from '@/components/ui/ThemeToggle';

const navigation = [
  // `exact` keeps the overview from staying highlighted on every sub-route.
  { name: 'Overview', href: '/dashboard', icon: Squares2X2Icon, exact: true },
  {
    name: 'Daily Bible Verse',
    href: '/dashboard/daily-verse',
    icon: BookOpenIcon,
  },
  { name: 'Bibles', href: '/dashboard/bibles', icon: BookOpenIcon },
  { name: 'Books', href: '/dashboard/books', icon: BookOpenIcon },
  {
    name: 'Bible Studies',
    href: '/dashboard/bible-studies',
    icon: DocumentTextIcon,
  },
  {
    name: 'Bible Study Categories',
    href: '/dashboard/bible-study-categories',
    icon: DocumentTextIcon,
  },
  {
    name: 'Bible Study Groups',
    href: '/dashboard/bible-study-groups',
    icon: UserGroupIcon,
  },
  { name: 'News', href: '/dashboard/news', icon: NewspaperIcon },
  { name: 'Events', href: '/dashboard/events', icon: CalendarDaysIcon },
  {
    name: 'Event Categories',
    href: '/dashboard/event-categories',
    icon: CalendarDaysIcon,
  },
  { name: 'Courses', href: '/dashboard/courses', icon: AcademicCapIcon },
  {
    name: 'Course Categories',
    href: '/dashboard/course-categories',
    icon: AcademicCapIcon,
  },
  { name: 'Quizzes', href: '/dashboard/quizzes', icon: QuestionMarkCircleIcon },
  {
    name: 'Quiz Categories',
    href: '/dashboard/quiz-categories',
    icon: QuestionMarkCircleIcon,
  },
  { name: 'Audios', href: '/dashboard/audios', icon: SpeakerWaveIcon },
  { name: 'Videos', href: '/dashboard/videos', icon: VideoCameraIcon },
  { name: 'Users', href: '/dashboard/users', icon: UsersIcon },
  { name: 'Reports', href: '/dashboard/reports', icon: FlagIcon },
  {
    name: 'Deletion Requests',
    href: '/dashboard/deletion-requests',
    icon: TrashIcon,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.replace('/');
    } catch {
      toast.error('Sign out failed');
    }
  };

  return (
    <div className='flex min-h-0 flex-1 flex-col border-r border-primary-100 bg-primary-50'>
      <div className='flex flex-1 flex-col overflow-y-auto pt-5 pb-4'>
        <div className='flex flex-shrink-0 items-center px-4'>
          <h1 className='text-2xl font-bold text-primary-700'>Admin Panel</h1>
        </div>
        <nav className='mt-5 flex-1 space-y-1 bg-primary-50 px-2'>
          {navigation.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center rounded-md px-2 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-900 font-semibold border-l-4 border-primary-600 ring-1 ring-inset ring-primary-200'
                    : 'text-primary-700 hover:bg-primary-50 hover:text-primary-800 border-l-4 border-transparent'
                }`}
              >
                <item.icon
                  className={`mr-3 h-6 w-6 flex-shrink-0 ${
                    isActive
                      ? 'text-primary-700'
                      : 'text-primary-400 group-hover:text-primary-600'
                  }`}
                  aria-hidden='true'
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className='flex flex-shrink-0 flex-col gap-1 border-t border-primary-100 p-4'>
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className='group flex w-full flex-shrink-0 cursor-pointer items-center rounded-md px-2 py-2 text-sm transition-colors hover:bg-primary-100'
        >
          <ArrowLeftOnRectangleIcon className='h-6 w-6 flex-shrink-0 text-primary-400 group-hover:text-primary-600' />
          <span className='ml-3 font-medium text-primary-700 group-hover:text-primary-800'>
            Sign out
          </span>
        </button>
      </div>
    </div>
  );
}
