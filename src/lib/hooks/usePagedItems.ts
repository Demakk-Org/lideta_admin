'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Client-side paging for a list the dashboard has already loaded.
 *
 * Every card grid pages the same way, so the page-in-range clamp and the
 * slice live here rather than being retyped per screen — the clamp especially,
 * because without it deleting the last item on the last page leaves you
 * looking at an empty one.
 *
 * `paginationProps` is meant to be spread straight into `<Pagination />`.
 */
export function usePagedItems<T>(
  items: T[],
  options: {
    /** Card grids default to 9, which fills whole rows in a 3-column grid. */
    pageSize?: number;
    pageSizeOptions?: number[];
  } = {},
) {
  const { pageSize: initialPageSize = 9, pageSizeOptions = [9, 18, 36, 72] } =
    options;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Keep the page in range when the list shrinks or the page size changes.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  /**
   * Back to the top. A filter change is a different list, so staying on
   * whatever page number was selected shows an empty page for no reason.
   */
  const resetPage = useCallback(() => setPage(1), []);

  return {
    pageItems,
    resetPage,
    paginationProps: {
      page,
      pageSize,
      total: items.length,
      onPageChange: setPage,
      onPageSizeChange: (size: number) => {
        setPageSize(size);
        setPage(1);
      },
      pageSizeOptions,
    },
  };
}
