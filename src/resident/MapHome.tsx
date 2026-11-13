import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronUp, LocateFixed, LocateOff, MapPin, Plus, Search, X } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { PhotoThumb, StatusTag } from '../components/ui';
import { CATEGORIES } from '../data/meta';
import { distanceMeters } from '../data/geo';
import type { Category, Issue } from '../data/types';
import { daysBetween, formatMeters } from '../lib/format';
import type { AddressResult } from '../lib/geocode';
import { useAddressSearch } from '../lib/useGeocode';
import { useUserLocation } from '../lib/userLocation';
import { navigate } from '../router';
import { useStore } from '../store';

export function VoteBox({ issue }: { issue: Issue }) {
  const { voted, vote } = useStore();
  const done = voted.includes(issue.id);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        vote(issue.id, 'map');
      }}
      aria-label={done ? 'You +1’d this' : '+1 this problem'}
      className={`flex w-11 shrink-0 flex-col items-center rounded-lg border py-1.5 text-sm font-semibold transition ${
        done ? 'border-brand bg-brand-soft text-brand' : 'border-slate-200 text-ink hover:border-brand hover:text-brand'
      }`}
    >
      <ChevronUp className="h-4 w-4" strokeWidth={2.5} />
      {issue.votes}
    </button>
  );
}

export default function MapHome() {
  const { issues, voted, confirmed, lastCreatedId, clearLastCreated, district, track, toast } = useStore();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Where the map should fly: a searched address or the resident's position. `n` re-flies on repeat taps.
  const [target, setTarget] = useState<{ lat: number; lng: number; n: number; place?: AddressResult } | null>(null);
  const [wantsLocate, setWantsLocate] = useState(false);
  const loc = useUserLocation();
  const you = loc.position;
  const addresses = useAddressSearch(searching ? query : '', district.center);

  // A "locate me" tap that had to ask first: fly once the fix arrives, explain if it doesn't.
  useEffect(() => {
    if (!wantsLocate || loc.locating) return;
    if (you) setTarget((t) => ({ lat: you.lat, lng: you.lng, n: (t?.n ?? 0) + 1 }));
    else if (loc.status === 'denied') toast('Location is blocked for this site. Allow it in your browser settings, or search an address.');
    else if (loc.status !== 'prompt') toast('Couldn’t find your location. Search an address instead.');
    else return;
    setWantsLocate(false);
  }, [wantsLocate, you, loc.locating, loc.status, toast]);

  const locate = () => {
    if (you) setTarget((t) => ({ lat: you.lat, lng: you.lng, n: (t?.n ?? 0) + 1 }));
    else {
      loc.request();
      setWantsLocate(true);
    }
  };

  const pickAddress = (place: AddressResult) => {
    setTarget((t) => ({ lat: place.lat, lng: place.lng, n: (t?.n ?? 0) + 1, place }));
    setQuery('');
    setSearching(false);
  };

  useEffect(() => {
    track({ name: 'map_view' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = issues.filter((i) => i.status !== 'fixed');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (!q || `${i.title} ${i.locationLabel} ${i.id}`.toLowerCase().includes(q)),
    );
  }, [active, category, query]);

  const ranked = [...visible].sort((a, b) => b.votes - a.votes);
  const created = lastCreatedId ? issues.find((i) => i.id === lastCreatedId) : undefined;
  // A fresh pin centers the map when it opens; after that, searches and "locate me" take over.
  const flyTo = target ?? (created ? { lat: created.lat, lng: created.lng } : undefined);
  const showDropdown = searching && query.trim().length > 0;
  const issueMatches = showDropdown ? ranked.slice(0, 3) : [];
  const hasPendingConfirm = issues.some((i) => i.status === 'fixed' && voted.includes(i.id) && !confirmed[i.id]);

  const chip = (selected: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm ${
      selected ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-ink'
    }`;

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0">
        <IssueMap
          issues={visible}
          selectedId={created?.id}
          center={flyTo}
          centerKey={target ? target.n : created?.id}
          pick={target?.place ?? null}
          voteLabelsAbove={60}
          showYou
          you={you}
          onSelect={(i) => navigate(`/i/${i.id}`)}
        />
      </div>

      <div className="absolute inset-x-0 top-0 z-[1000] space-y-2.5 p-4">
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearching(true);
              }}
              onFocus={() => setSearching(true)}
              onBlur={() => setSearching(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearching(false);
                if (e.key === 'Enter' && addresses.results[0] && !ranked.length) pickAddress(addresses.results[0]);
              }}
              placeholder="Search problems or an address"
              aria-label="Search problems or an address"
              className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </label>
          <button
            onClick={() => navigate('/updates')}
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm"
            aria-label="Your updates"
          >
            <Bell className="h-5 w-5" />
            {hasPendingConfirm && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand" />}
          </button>
        </div>
        {showDropdown && (
          <div
            className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 bg-white text-sm shadow-lg"
            onMouseDown={(e) => e.preventDefault()} // keep focus in the input while choosing
          >
            {issueMatches.length > 0 && (
              <>
                <p className="px-3 pt-2.5 font-mono text-[11px] tracking-wider text-slate-500">PROBLEMS · {ranked.length}</p>
                <ul>
                  {issueMatches.map((i) => (
                    <li key={i.id}>
                      <button onClick={() => navigate(`/i/${i.id}`)} className="w-full px-3 py-2 text-left hover:bg-slate-50">
                        <span className="font-medium">{i.title}</span>
                        <span className="text-slate-500"> · {i.locationLabel}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {query.trim().length >= 3 && (
              <>
                <p className="px-3 pt-2.5 font-mono text-[11px] tracking-wider text-slate-500">ADDRESSES</p>
                <ul className="pb-1">
                  {addresses.results.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => pickAddress(a)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span>
                          <span className="font-medium">{a.label}</span>
                          {a.detail && <span className="text-slate-500"> · {a.detail}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                  {addresses.status === 'loading' && !addresses.results.length && <li className="px-3 py-2 text-slate-500">Searching…</li>}
                  {addresses.status === 'done' && !addresses.results.length && (
                    <li className="px-3 py-2 text-slate-500">No New York City address matches.</li>
                  )}
                  {addresses.status === 'error' && <li className="px-3 py-2 text-slate-500">Address search isn’t reachable right now.</li>}
                </ul>
              </>
            )}
            {!issueMatches.length && query.trim().length < 3 && (
              <p className="px-3 py-2.5 text-slate-500">No problems match. Keep typing to search addresses.</p>
            )}
          </div>
        )}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button className={chip(category === 'all')} onClick={() => setCategory('all')}>
            All <span className="opacity-70">{active.length}</span>
          </button>
          {district.categories.map((c) => {
            const count = active.filter((i) => i.category === c).length;
            return (
              <button key={c} className={chip(category === c)} onClick={() => setCategory(category === c ? 'all' : c)}>
                {category !== c && <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORIES[c].color }} />}
                {CATEGORIES[c].label} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-[height] ${
          expanded ? 'h-[72%]' : 'h-[40%]'
        }`}
      >
        <button
          onClick={locate}
          className="absolute -top-16 left-4 grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm"
          aria-label={loc.status === 'denied' ? 'Location is off' : 'Show my location'}
          title={loc.status === 'denied' ? 'Location is off for this site' : 'Show my location'}
        >
          {loc.status === 'denied' || loc.status === 'unavailable' ? (
            <LocateOff className="h-5 w-5 text-slate-400" />
          ) : (
            <LocateFixed className={`h-5 w-5 ${you ? 'text-[#2563eb]' : loc.locating ? 'animate-pulse text-slate-500' : 'text-ink'}`} />
          )}
        </button>

        <button
          onClick={() => navigate('/new')}
          className="absolute -top-16 right-4 flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-white shadow-lg hover:bg-brand-dark"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} /> Pin a problem
        </button>

        <button onClick={() => setExpanded(!expanded)} className="flex justify-center pb-1 pt-2" aria-label="Expand list">
          <span className="h-1 w-9 rounded-full bg-slate-300" />
        </button>

        {created && (
          <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <button className="text-left" onClick={() => navigate(`/i/${created.id}`)}>
              <span className="font-semibold">Your pin is live.</span> Neighbors can +1 it now.
            </button>
            <button onClick={clearLastCreated} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold">{you ? 'Most +1’d nearby' : `Most +1’d in ${district.area}`}</h2>
          <span className="text-sm text-slate-500">{ranked.length} open</span>
        </div>

        <ul className="flex-1 overflow-y-auto px-5 pb-4">
          {ranked.map((issue) => (
            <li
              key={issue.id}
              onClick={() => navigate(`/i/${issue.id}`)}
              className="flex cursor-pointer items-center gap-3 border-t border-slate-100 py-3"
            >
              <VoteBox issue={issue} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{issue.title}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  <StatusTag status={issue.status} resident className="text-slate-600" /> ·{' '}
                  {you && <>{formatMeters(distanceMeters(you, issue))} · </>}
                  {daysBetween(issue.createdAt)} days
                </p>
              </div>
              <PhotoThumb issue={issue} className="h-12 w-12 shrink-0 rounded-lg" />
            </li>
          ))}
          {!ranked.length && <li className="py-8 text-center text-sm text-slate-500">No open problems match.</li>}
        </ul>
      </div>
    </div>
  );
}
