import { useEffect, useRef, useState } from 'react';
import { Logo } from '../components/ui';
import { DEMO_STAFF_EMAIL, safeNext } from './auth';
import { useStore } from '../store';

/**
 * Staff sign-in (email + password through `store.signIn`). Once a staff session exists it
 * returns to `next` (only `/org...` paths are honoured). In demo mode any email works.
 */
export default function Login({ next }: { next: string | null }) {
  const { signIn, district, staff, mode } = useStore();
  const demo = mode === 'demo';
  const target = safeNext(next);
  const [email, setEmail] = useState(demo ? DEMO_STAFF_EMAIL : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notStaff, setNotStaff] = useState(false);
  const notStaffTimer = useRef<number | undefined>(undefined);

  // Leave as soon as there is a staff session (also covers arriving here already signed in).
  useEffect(() => {
    if (staff) window.location.replace(`#${target}`);
  }, [staff, target]);

  useEffect(() => () => window.clearTimeout(notStaffTimer.current), []);

  const submit = async () => {
    setError(null);
    setNotStaff(false);
    const e = email.trim();
    if (!e) return setError('Enter your work email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError('That doesn’t look like an email address.');
    if (!demo && !password) return setError('Enter your password.');
    setBusy(true);
    const ok = await signIn(e, password);
    setBusy(false);
    if (!ok) {
      setError('Couldn’t sign you in. Check your email and password and try again.');
      return;
    }
    // Signed in, but the account may not be on this district's staff list.
    notStaffTimer.current = window.setTimeout(() => setNotStaff(true), 2500);
  };

  const field = 'mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-[15px] outline-none focus:border-brand';

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-100 px-4 py-10 sm:items-center sm:py-6">
      <div className="w-full max-w-sm">
        <form
          noValidate
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Logo />
          <div>
            <p className="font-mono text-[10px] tracking-wider text-slate-500">{district.name.toUpperCase()} · STAFF</p>
            <h1 className="mt-1 text-xl font-bold">Sign in to the dashboard</h1>
          </div>
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="username"
              autoFocus={!demo}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {notStaff && !staff && (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You’re signed in, but this account isn’t on the staff list for {district.name}. Ask whoever runs your pilot to add you.
            </p>
          )}
          <button
            disabled={busy}
            className="h-11 w-full rounded-lg bg-brand font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {demo ? (
            <p className="text-xs text-slate-500">Demo: any email signs you in as sample staff. The password isn’t checked.</p>
          ) : (
            <p className="text-xs text-slate-500">
              Accounts are set up by the Problem Pins team.
              {district.contactEmail && (
                <>
                  {' '}
                  Locked out? Email <a className="font-medium text-brand" href={`mailto:${district.contactEmail}`}>{district.contactEmail}</a>.
                </>
              )}
            </p>
          )}
        </form>
        <a href="#/" className="mt-4 block text-center text-sm text-slate-500 hover:text-ink">
          Go to the public map
        </a>
      </div>
    </div>
  );
}
