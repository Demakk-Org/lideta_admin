import { redirect } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { NotAdminError, requireAdmin } from '@/lib/server/requireAdmin';

// The admin check reads the request cookie, so these pages can't be static.
export const dynamic = 'force-dynamic';

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin('[dashboardLayout]');
  } catch (error) {
    const reason =
      error instanceof NotAdminError && error.status === 403
        ? 'forbidden'
        : 'expired';
    redirect(`/api/session?reason=${reason}`);
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
