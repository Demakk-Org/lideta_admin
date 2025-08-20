import NewsClient from './NewsClient';

export default function NewsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-primary-800">News</h1>
      <p className="text-sm text-primary-700">Manage church news updates.</p>
      <NewsClient />
    </div>
  );
}
