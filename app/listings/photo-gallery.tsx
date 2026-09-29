"use client";

import { useRef, useState } from "react";

/**
 * Responsive photo gallery for the buyer listing page.
 *
 * Renders a mobile-friendly thumbnail grid; tapping a thumbnail opens the
 * photo full-size in a native <dialog> lightbox with prev/next when there is
 * more than one photo. A link is offered to open the current photo in a new
 * tab so buyers can zoom freely on a phone.
 *
 * The component renders nothing when there are no photos - the parent omits
 * the whole section rather than showing an empty gallery.
 */

type PhotoGalleryProps = {
  /** File URLs for the lot photos (already filtered to non-empty by the page). */
  photos: string[];
  /** Human-readable label used in alt text and the dialog, e.g. the title. */
  label: string;
};

export function PhotoGallery({ photos, label }: PhotoGalleryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);

  const show = (i: number) => {
    setIndex(i);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();
  const step = (delta: number) =>
    setIndex((current) =>
      current === null ? current : (current + delta + photos.length) % photos.length,
    );

  return (
    <section aria-label="Foto" className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        Foto
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => show(i)}
            aria-label={`Buka foto ${i + 1} dari ${photos.length}`}
            className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${label} foto ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="m-auto w-[min(92vw,56rem)] rounded-xl bg-slate-950 p-4 backdrop:bg-slate-950/80 sm:p-6"
      >
        {index !== null ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-300">
                {label} — foto {index + 1} dari {photos.length}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Tutup foto"
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Tutup
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[index]}
              alt={`${label} foto ${index + 1} diperbesar`}
              className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={photos.length <= 1}
                aria-label="Foto sebelumnya"
                className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <a
                href={photos[index]}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                Buka ukuran penuh
              </a>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={photos.length <= 1}
                aria-label="Foto berikutnya"
                className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}