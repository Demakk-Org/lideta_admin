"use client";

/**
 * The frame every paged card grid in the dashboard uses: a toolbar that stays
 * put, a grid that scrolls on its own, and a pager pinned to the bottom.
 *
 * The page fills the viewport rather than growing with the list, so the pager
 * is always reachable without scrolling to the end. `3rem` is the dashboard
 * shell's `py-6`; nothing else sits between this and the viewport edge.
 *
 * The pager renders even when the list is empty — it is part of the frame, and
 * having it appear and disappear made the grid jump a row.
 */
export default function PagedGridPage({
  toolbar,
  pager,
  children,
}: {
  toolbar: React.ReactNode;
  pager: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4">
      <div className="shrink-0">{toolbar}</div>

      {/*
        `min-h-0` is what makes this scroll: a flex child will not shrink below
        its content without it, and the overflow never engages.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      <div className="shrink-0 rounded-md border border-primary-200 bg-white">
        {pager}
      </div>
    </div>
  );
}

/**
 * The empty state for one of those grids: fills the scroll area and centres in
 * it. A `col-span-full` cell inside the grid cannot — the grids are
 * `items-start`, so a cell centres across its row but never down the space
 * below it.
 */
export function EmptyGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-primary-600">
      {children}
    </div>
  );
}
