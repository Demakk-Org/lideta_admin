"use client";

import React, { useCallback, useMemo, useState } from "react";

export type DraggableListProps<T> = {
  items: T[];
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey?: (item: T, index: number) => React.Key;
  listClassName?: string;
  itemClassName?: string;
  disabled?: boolean;
  handleAriaLabel?: string;
};

export default function DraggableList<T>(props: DraggableListProps<T>) {
  const { items, onReorder, renderItem, getKey, listClassName, itemClassName, disabled, handleAriaLabel } = props;
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [kbGrabIndex, setKbGrabIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    if (disabled) return;
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Some browsers need data set to enable DnD
    e.dataTransfer.setData("text/plain", String(index));
  }, [disabled]);

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }, []);

  const handleDragEnter = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    setOverIndex(index);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Optional: could clear highlight when leaving
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
    setOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      const fromStr = e.dataTransfer.getData("text/plain");
      const from = fromStr ? Number(fromStr) : draggingIndex;
      if (from == null || Number.isNaN(from)) return;
      if (from === index) return handleDragEnd();

      const next = items.slice();
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      onReorder(next);
      handleDragEnd();
    },
    [draggingIndex, handleDragEnd, items, onReorder]
  );

  // Keyboard reordering (accessibility)
  const handleKeyDownOnHandle = useCallback((index: number, e: React.KeyboardEvent) => {
    if (disabled) return;
    const key = e.key;
    if (kbGrabIndex == null) {
      if (key === " " || key === "Enter") {
        e.preventDefault();
        setKbGrabIndex(index);
      }
      return;
    }
    // When grabbed
    if (key === "Escape" || key === "Enter") {
      e.preventDefault();
      setKbGrabIndex(null);
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      const from = kbGrabIndex;
      let to = from + (key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= items.length) return;
      const next = items.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
      setKbGrabIndex(to);
    }
  }, [disabled, items, kbGrabIndex, onReorder]);

  const isDragging = useMemo(() => draggingIndex != null, [draggingIndex]);

  return (
    <div className={listClassName} role="list"
      onDragOver={(e) => e.preventDefault()}
      aria-disabled={disabled ? true : undefined}
    >
      {items.map((item, index) => {
        const key = getKey ? getKey(item, index) : index;
        const isOver = overIndex === index && isDragging;
        return (
          <div
            key={key}
            onDragOver={(e) => handleDragOver(index, e)}
            onDragEnter={(e) => handleDragEnter(index, e)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(index, e)}
            className={
              (itemClassName || "") +
              (isOver ? " ring-2 ring-primary-400" : "") +
              (draggingIndex === index ? " opacity-60" : "")
            }
            role="listitem"
          >
            {/* Drag handle */}
            <div className="-mt-1 mb-2 flex items-center gap-2">
              <span
                draggable
                onDragStart={(e) => handleDragStart(index, e)}
                onDragEnd={handleDragEnd}
                onKeyDown={(e) => handleKeyDownOnHandle(index, e)}
                tabIndex={disabled ? -1 : 0}
                className="cursor-grab select-none px-2 py-1 rounded border border-primary-300 bg-primary-100 text-primary-900 text-xl leading-none font-bold shadow-sm"
                title={handleAriaLabel || "Drag to reorder"}
                aria-label={handleAriaLabel || "Drag to reorder"}
                aria-pressed={kbGrabIndex === index}
              >
                ⋮⋮
              </span>
              <span className="text-xs text-primary-800">Drag to reorder</span>
            </div>
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}
