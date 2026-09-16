import UsersClient from './UsersClient';

/**
 * Renders the client alone, like every other list page. Chrome above it would
 * push the client's viewport-height frame down by that much and drop the
 * pinned pager below the fold — the page heading lives in the toolbar instead.
 */
export default function UsersPage() {
  return <UsersClient />;
}
