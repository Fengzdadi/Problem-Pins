import { useMemo, useRef, useState } from 'react';
import { Camera, ChevronUp, X } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { CATEGORIES, CATEGORY_ORDER } from '../data/meta';
import { SCAN_POINTS } from '../data/sampleData';
import { YOU_ARE_HERE, at, describeLocation, distanceMeters } from '../data/geo';
import type { Category } from '../data/types';
import { formatMeters } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

function resizeImage(file: File, max = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function NewPin({ category: initialCategory, from }: { category: string | null; from: string | null }) {
  const store = useStore();
  const scan = from ? SCAN_POINTS[from] : undefined;
  const start = scan ? at(scan.street, scan.ave) : YOU_ARE_HERE;

  const [category, setCategory] = useState<Category | null>(
    initialCategory && initialCategory in CATEGORIES ? (initialCategory as Category) : null,
  );
  const [pos, setPos] = useState(start);
  const [moved, setMoved] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [dismissedSimilar, setDismissedSimilar] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const similar = useMemo(() => {
    if (!category) return undefined;
    return store.issues
      .filter((i) => i.status !== 'fixed' && i.category === category && !dismissedSimilar.includes(i.id))
      .map((i) => ({ issue: i, d: distanceMeters(pos, i) }))
      .filter((x) => x.d < 250)
      .sort((a, b) => a.d - b.d)[0];
  }, [category, pos, store.issues, dismissedSimilar]);

  const canPost = category && title.trim().length > 2;
  const label = describeLocation(pos.lat, pos.lng);

  const submit = () => {
    if (!category || !canPost) return;
    store.addIssue({
      title: title.trim(),
      description: description.trim(),
      category,
      lat: pos.lat,
      lng: pos.lng,
      locationLabel: label,
      photos,
      via: scan ? `QR · ${scan.name} ${from}` : 'Map · problempins.org',
    });
    navigate('/');
  };

  const sectionLabel = 'mb-2 font-mono text-[11px] tracking-wider text-slate-500';

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-5 pb-2 pt-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">Pin a problem</h1>
        </div>
        <button onClick={() => history.back()} className="text-sm text-slate-500">
          Cancel
        </button>
      </header>

      <div className="flex-1 space-y-5 px-5 pb-6 pt-2">
        <section>
          <h2 className={sectionLabel}>CATEGORY</h2>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  category === c ? 'border-brand bg-brand-soft text-brand' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORIES[c].color }} />
                {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className={sectionLabel}>LOCATION</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="h-40">
              <IssueMap
                issues={[]}
                center={pos}
                zoom={17}
                pick={pos}
                onPick={(p) => {
                  setPos(p);
                  setMoved(true);
                }}
              />
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-slate-500">
                  {moved ? 'Pinned on the map' : scan ? `From the ${scan.name} QR` : 'From your location · ±8 m'}
                </p>
              </div>
              <span className="text-xs font-medium text-brand">Tap map to adjust</span>
            </div>
          </div>
        </section>

        {similar && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-800">Similar pin nearby</p>
            <p className="mt-1 text-sm text-slate-700">
              “{similar.issue.title}” · {similar.issue.votes} neighbors · {formatMeters(similar.d)} away
            </p>
            <div className="mt-3 flex items-center gap-4">
              <button
                onClick={() => {
                  store.vote(similar.issue.id);
                  navigate(`/i/${similar.issue.id}`);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={2.5} /> +1 that instead
              </button>
              <button onClick={() => setDismissedSimilar([...dismissedSimilar, similar.issue.id])} className="text-sm text-slate-600">
                No, it’s different
              </button>
            </div>
          </section>
        )}

        <section>
          <h2 className={sectionLabel}>TITLE</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sandwich board blocks the curb cut"
            className="h-12 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none focus:border-brand"
          />
        </section>

        <section>
          <h2 className={sectionLabel}>PHOTOS · {photos.length}</h2>
          <div className="flex gap-2">
            {photos.map((p, idx) => (
              <div key={idx} className="relative">
                <img src={p} alt="" className="h-[68px] w-[68px] rounded-lg object-cover" />
                <button
                  onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <button
                onClick={() => fileInput.current?.click()}
                className="flex h-[68px] w-[68px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500"
              >
                <Camera className="mb-1 h-5 w-5" /> Add
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setPhotos([...photos, await resizeImage(file)]);
                e.target.value = '';
              }}
            />
          </div>
        </section>

        <section>
          <h2 className={sectionLabel}>WHAT’S WRONG?</h2>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What did you see, and when?"
            className="w-full rounded-xl border border-slate-200 p-3 text-[15px] outline-none focus:border-brand"
          />
        </section>
      </div>

      <footer className="sticky bottom-0 border-t border-slate-100 bg-white px-5 pb-4 pt-3">
        <button
          onClick={submit}
          disabled={!canPost}
          className="w-full rounded-xl bg-brand py-3.5 text-lg font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Post pin
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          {canPost ? 'Posted publicly. Your name is not shown.' : 'Pick a category and add a short title.'}
        </p>
      </footer>
    </div>
  );
}
