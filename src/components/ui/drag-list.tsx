// Tiny, dependency-free drag & drop list used across Supply Hub to reorder
// anything (alternate properties, zones, priority lists).
import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DragListProps<T> {
  items: T[];
  keyOf: (item: T, index: number) => string;
  render: (item: T, index: number) => ReactNode;
  /** Called with the source and destination index after a drop. */
  onReorder: (from: number, to: number) => void;
  className?: string;
  itemClassName?: string;
  /** Render horizontally (chips) instead of stacked rows. */
  inline?: boolean;
  emptyLabel?: string;
}

export function DragList<T>({
  items,
  keyOf,
  render,
  onReorder,
  className,
  itemClassName,
  inline,
  emptyLabel,
}: DragListProps<T>) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  if (items.length === 0 && emptyLabel) {
    return <div className="text-[11px] text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className={cn(inline ? "flex flex-wrap gap-1.5" : "space-y-1.5", className)}>
      {items.map((item, i) => (
        <div
          key={keyOf(item, i)}
          draggable
          onDragStart={() => setDrag(i)}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => { e.preventDefault(); if (over !== i) setOver(i); }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag !== null && drag !== i) onReorder(drag, i);
            setDrag(null);
            setOver(null);
          }}
          className={cn(
            "group flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs transition-colors",
            drag === i && "opacity-40",
            over === i && drag !== null && drag !== i && "border-accent ring-1 ring-accent/40",
            itemClassName,
          )}
        >
          <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground group-hover:text-accent" aria-hidden />
          <span className="tabular-nums text-[10px] text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">{render(item, i)}</div>
        </div>
      ))}
    </div>
  );
}
