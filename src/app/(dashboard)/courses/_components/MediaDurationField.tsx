"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration, parseDuration } from "@/lib/api/lessonEstimate";

type ProbeState = "idle" | "probing" | "failed";

/** How long to wait for `loadedmetadata` before giving up on the probe. */
const PROBE_TIMEOUT_MS = 15000;
/**
 * The URL field rewrites on every keystroke, so settle before probing —
 * otherwise each half-typed URL fires a request that fails and flashes an
 * error under the field.
 */
const PROBE_DEBOUNCE_MS = 700;

/**
 * The playback length of one audio/video block, feeding the lesson's time
 * estimate.
 *
 * For a file URL the browser reads it straight off the media metadata — no
 * CORS headers needed, since `duration` is not sample data. YouTube exposes
 * nothing without the Data API, so those blocks are typed by hand; when that
 * API is wired up it fills this same field and the rest stays unchanged.
 */
export default function MediaDurationField({
  kind,
  url,
  autoProbe,
  seconds,
  onChange,
}: {
  kind: "audio" | "video";
  url: string;
  /** False for YouTube, where the URL is an id with no readable metadata. */
  autoProbe: boolean;
  seconds?: number;
  onChange: (next: number | undefined) => void;
}) {
  const [text, setText] = useState(seconds ? formatDuration(seconds) : "");
  const [probe, setProbe] = useState<ProbeState>("idle");
  /** The URL we last probed, so re-renders don't re-fetch the same file. */
  const probedUrl = useRef<string | null>(null);
  // The parent passes a fresh closure every render; a ref keeps it out of the
  // effect's deps so the probe isn't torn down mid-load.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Follow the value when it changes from outside this field: a finished
  // probe, a different audio picked from the library, or the form reopening.
  useEffect(() => {
    setText(seconds ? formatDuration(seconds) : "");
  }, [seconds]);

  useEffect(() => {
    const trimmed = url.trim();
    if (!autoProbe || !trimmed || probedUrl.current === trimmed) return;

    let cancelled = false;
    let el: HTMLMediaElement | null = null;
    let timeout = 0;

    const stop = () => {
      window.clearTimeout(timeout);
      if (!el) return;
      el.removeAttribute("src");
      el.load();
      el = null;
    };

    const debounce = window.setTimeout(() => {
      if (cancelled) return;
      // Only mark it probed once we actually start, so a URL abandoned
      // mid-debounce is still probed if it comes back.
      probedUrl.current = trimmed;
      setProbe("probing");

      el = document.createElement(kind);
      el.preload = "metadata";

      timeout = window.setTimeout(() => {
        if (cancelled) return;
        setProbe("failed");
        stop();
      }, PROBE_TIMEOUT_MS);

      el.addEventListener("loadedmetadata", () => {
        if (cancelled || !el) return;
        // Live streams report Infinity; treat that as unreadable.
        const d = el.duration;
        if (Number.isFinite(d) && d > 0) {
          setProbe("idle");
          onChangeRef.current(Math.round(d));
        } else {
          setProbe("failed");
        }
        stop();
      });
      el.addEventListener("error", () => {
        if (cancelled) return;
        setProbe("failed");
        stop();
      });

      el.src = trimmed;
      el.load();
    }, PROBE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      stop();
    };
  }, [url, autoProbe, kind]);

  const handleText = (next: string) => {
    setText(next);
    onChange(parseDuration(next));
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-primary-800">Length</label>
        <input
          type="text"
          value={text}
          onChange={(e) => handleText(e.target.value)}
          className="w-24 rounded-md border border-primary-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="mm:ss"
          inputMode="numeric"
        />
        {probe === "probing" && (
          <span className="text-xs text-primary-600">Reading length...</span>
        )}
      </div>
      <p className="mt-1 text-xs text-primary-600">
        {probe === "failed"
          ? "Could not read the length from that file — enter it manually."
          : autoProbe
            ? "Read from the file automatically. Counts toward the lesson's estimated time."
            : "YouTube does not expose its length here — enter it so the lesson's estimated time includes this video."}
      </p>
    </div>
  );
}
