"use client";

export type PreviewDevice = "mobileS" | "mobileL" | "tablet";

// Class strings are written out in full so Tailwind can pick them up statically.
export const PREVIEW_DEVICES: { key: PreviewDevice; label: string; hint: string; widthClass: string }[] = [
  { key: "mobileS", label: "Mobile S", hint: "360px", widthClass: "max-w-[360px]" },
  { key: "mobileL", label: "Mobile L", hint: "430px", widthClass: "max-w-[430px]" },
  { key: "tablet", label: "Tablet", hint: "768px", widthClass: "max-w-[768px]" },
];

export const DEFAULT_PREVIEW_DEVICE: PreviewDevice = "mobileS";

export function previewWidthClass(device: PreviewDevice) {
  return PREVIEW_DEVICES.find((d) => d.key === device)?.widthClass ?? "max-w-[360px]";
}

export default function DevicePreviewSelector({
  value,
  onChange,
  className = "",
}: {
  value: PreviewDevice;
  onChange: (d: PreviewDevice) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 p-1 ${className}`}>
      {PREVIEW_DEVICES.map((d) => (
        <button
          key={d.key}
          type="button"
          title={`${d.label} — ${d.hint}`}
          onClick={() => onChange(d.key)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            value === d.key
              ? "bg-white text-primary-900 shadow-sm"
              : "text-primary-600 hover:text-primary-800"
          }`}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
