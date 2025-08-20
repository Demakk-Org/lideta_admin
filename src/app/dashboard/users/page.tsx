import UsersClient from './UsersClient';

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary-800">Users</h1>
      <p className="text-sm text-primary-700">Manage users of the church app.</p>
      <UsersClient />
    </div>
  );
}
