"use client";

export type Column<T> = {
  header: React.ReactNode;
  /** Applied to this column's header cell and every body cell in it. */
  className?: string;
  cell: (row: T) => React.ReactNode;
};

/**
 * The row-list counterpart to `PagedGridPage`'s card grid, styled after the
 * daily-verse table: a bordered card, sticky-looking header band, and hairline
 * dividers between rows.
 *
 * Columns are declared rather than hand-written per screen, so the three
 * category tables cannot drift apart in padding, type scale or divider colour
 * the way three copies of the same markup do.
 */
export default function DataTable<T>({
  columns,
  rows,
  getKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  empty: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-primary-100 bg-white/60 backdrop-blur">
      {/* Narrow screens scroll the table sideways rather than crushing it. */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-primary-100">
          <thead className="bg-primary-50">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-4 py-2 text-left text-xs font-semibold text-primary-700 ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100">
            {rows.map((row) => (
              <tr key={getKey(row)} className="bg-white/60">
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={`px-4 py-2 text-sm text-primary-800 ${c.className ?? ""}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                {/*
                  A tall cell rather than a padded one: a `td` centres its
                  content vertically by default, so this lands in the middle of
                  the empty space instead of hugging the header.
                */}
                <td
                  colSpan={columns.length}
                  className="h-64 text-center text-sm text-primary-700"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
