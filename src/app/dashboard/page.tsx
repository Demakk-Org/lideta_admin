'use client';

import Link from 'next/link';
import {
  UsersIcon,
  UserGroupIcon,
  BookOpenIcon,
  NewspaperIcon,
  CalendarDaysIcon,
  SpeakerWaveIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  AcademicCapIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

type Feature = {
  name: string;
  href: string;
  description: string;
  icon: typeof BookOpenIcon;
};

type FeatureGroup = {
  title: string;
  features: Feature[];
};

const featureGroups: FeatureGroup[] = [
  {
    title: 'Scripture',
    features: [
      {
        name: 'Daily Bible Verse',
        href: '/dashboard/daily-verse',
        description:
          'Schedule the verse of the day on the Ethiopian calendar view.',
        icon: BookOpenIcon,
      },
      {
        name: 'Bibles',
        href: '/dashboard/bibles',
        description: 'Manage Bible translations available in the app.',
        icon: BookOpenIcon,
      },
      {
        name: 'Books',
        href: '/dashboard/books',
        description: 'Manage the digital library of books and readings.',
        icon: BookOpenIcon,
      },
    ],
  },
  {
    title: 'Bible Study',
    features: [
      {
        name: 'Bible Studies',
        href: '/dashboard/bible-studies',
        description: 'Create and publish study lessons for the congregation.',
        icon: DocumentTextIcon,
      },
      {
        name: 'Bible Study Categories',
        href: '/dashboard/bible-study-categories',
        description: 'Organize studies into categories shown in the app.',
        icon: DocumentTextIcon,
      },
      {
        name: 'Bible Study Groups',
        href: '/dashboard/bible-study-groups',
        description: 'Manage study groups, their leaders and members.',
        icon: UserGroupIcon,
      },
    ],
  },
  {
    title: 'Community',
    features: [
      {
        name: 'News',
        href: '/dashboard/news',
        description: 'Publish announcements and push notifications.',
        icon: NewspaperIcon,
      },
      {
        name: 'Events',
        href: '/dashboard/events',
        description: 'Schedule church events and manage their details.',
        icon: CalendarDaysIcon,
      },
      {
        name: 'Event Categories',
        href: '/dashboard/event-categories',
        description: 'Group events into categories for easier browsing.',
        icon: CalendarDaysIcon,
      },
    ],
  },
  {
    title: 'Learning',
    features: [
      {
        name: 'Courses',
        href: '/dashboard/courses',
        description: 'Build courses with lessons and track their content.',
        icon: AcademicCapIcon,
      },
      {
        name: 'Course Categories',
        href: '/dashboard/course-categories',
        description: 'Organize courses into categories.',
        icon: AcademicCapIcon,
      },
      {
        name: 'Quizzes',
        href: '/dashboard/quizzes',
        description: 'Create quizzes and manage their questions.',
        icon: QuestionMarkCircleIcon,
      },
      {
        name: 'Quiz Categories',
        href: '/dashboard/quiz-categories',
        description: 'Organize quizzes into categories.',
        icon: QuestionMarkCircleIcon,
      },
    ],
  },
  {
    title: 'Media',
    features: [
      {
        name: 'Audios',
        href: '/dashboard/audios',
        description: 'Upload sermons, hymns and other audio content.',
        icon: SpeakerWaveIcon,
      },
      {
        name: 'Videos',
        href: '/dashboard/videos',
        description: 'Manage video teachings and recordings.',
        icon: VideoCameraIcon,
      },
    ],
  },
  {
    title: 'People',
    features: [
      {
        name: 'Users',
        href: '/dashboard/users',
        description: 'Review app accounts, roles and access.',
        icon: UsersIcon,
      },
    ],
  },
];

export default function Dashboard() {
  const totalFeatures = featureGroups.reduce(
    (sum, group) => sum + group.features.length,
    0
  );

  return (
    <div className='space-y-8'>
      <div>
        <h1 className='text-2xl font-semibold text-primary-800'>Dashboard</h1>
        <p className='mt-1 text-sm text-primary-700'>
          An overview of all {totalFeatures} sections you can manage. Select one
          to get started.
        </p>
      </div>

      {featureGroups.map((group) => (
        <section key={group.title} className='space-y-3'>
          <h2 className='text-xs font-semibold uppercase tracking-wider text-primary-500'>
            {group.title}
          </h2>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {group.features.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className='group flex flex-col rounded-lg border border-primary-100 bg-white p-4 transition-colors hover:border-primary-300 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
              >
                <div className='flex items-start justify-between'>
                  <span className='inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-100 text-primary-700'>
                    <feature.icon className='h-6 w-6' aria-hidden='true' />
                  </span>
                  <ArrowRightIcon
                    className='h-4 w-4 text-primary-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600'
                    aria-hidden='true'
                  />
                </div>
                <h3 className='mt-3 text-sm font-semibold text-primary-900'>
                  {feature.name}
                </h3>
                <p className='mt-1 text-xs leading-relaxed text-primary-600'>
                  {feature.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
