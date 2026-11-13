import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import markUrl from '../../brand/mark.svg';
import pipUrl from '../../brand/pip-hello.svg';
import type { District, ScanPoint } from '../data/types';
import { displayLink, qrSvg, shortLink } from '../lib/qr';

/**
 * A US Letter poster for one scan point, laid out in inches so it prints at true size.
 * `scale` shrinks it for on-screen previews.
 */
export function Poster({ point, district, scale = 1 }: { point: ScanPoint; district: District; scale?: number }) {
  const url = shortLink(point.code);
  const svg = useQrSvg(url);
  const page = (
    <div
      className="flex h-[11in] w-[8.5in] flex-col bg-white px-[0.7in] pb-[0.55in] pt-[0.6in] text-ink"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[0.12in]">
          <img src={markUrl} alt="" className="h-[0.42in]" />
          <span className="text-[17pt] font-semibold">Problem Pins</span>
        </div>
        <span className="text-[13pt] text-slate-500">with {district.name}</span>
      </div>

      <h1 className="mt-[0.55in] text-[50pt] font-bold leading-[1.02] tracking-tight">
        See a problem here?
        <br />
        <span className="text-brand">Pin it or +1 it.</span>
      </h1>
      <p className="mt-[0.22in] max-w-[6.4in] text-[15pt] leading-snug text-slate-600">
        A broken light, a missing bench, an overflowing bin. Scan to tell {district.name}, or +1 a problem a neighbor already
        reported. No app, no account.
      </p>

      <div className="relative mt-[0.4in] flex items-end gap-[0.35in]">
        <div className="w-[4.3in] shrink-0">
          <div
            className="aspect-square w-full rounded-[0.12in] border-[0.03in] border-ink p-[0.1in] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
            role="img"
            aria-label={`QR code for ${url}`}
          />
          <p className="mt-[0.14in] text-center font-mono text-[15pt] font-medium">{displayLink(url)}</p>
        </div>
        <img src={pipUrl} alt="" className="mb-[0.5in] w-[1.7in]" />
      </div>

      <div className="mt-auto flex items-end justify-between border-t border-slate-300 pt-[0.16in] text-[10.5pt] text-slate-500">
        <div>
          <p className="font-mono tracking-wider text-ink">
            {point.code} · {point.name.toUpperCase()}
          </p>
          <p className="mt-[0.04in]">Pins go to {district.name}. Problems the City owns are forwarded to 311.</p>
        </div>
        <span className="font-mono tracking-wider">{district.area.toUpperCase()}</span>
      </div>
    </div>
  );

  if (scale === 1) return page;
  return (
    <div className="overflow-hidden" style={{ width: `${8.5 * scale}in`, height: `${11 * scale}in` }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{page}</div>
    </div>
  );
}

export function useQrSvg(text: string) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    qrSvg(text).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [text]);
  return svg;
}

/**
 * Prints one poster: renders it outside the app root, hides everything else for print,
 * opens the print dialog once the QR and images are ready, and cleans up afterwards.
 */
export function PrintPoster({ point, district, onDone }: { point: ScanPoint; district: District; onDone: () => void }) {
  useEffect(() => {
    const done = () => onDone();
    window.addEventListener('afterprint', done);
    let tries = 0;
    const timer = window.setInterval(() => {
      const root = document.querySelector('.pp-print-root');
      const ready =
        root?.querySelector('svg') && [...(root?.querySelectorAll('img') ?? [])].every((img) => (img as HTMLImageElement).complete);
      if (ready || ++tries > 40) {
        window.clearInterval(timer);
        window.print();
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [onDone]);

  return createPortal(
    <div className="pp-print-root">
      <style>{`
        @media screen { .pp-print-root { display: none; } }
        @media print {
          @page { size: letter portrait; margin: 0; }
          html, body { height: auto !important; background: white !important; }
          body > *:not(.pp-print-root) { display: none !important; }
        }
      `}</style>
      <Poster point={point} district={district} />
    </div>,
    document.body,
  );
}
