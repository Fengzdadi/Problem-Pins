import { useState } from 'react';
import { Logo } from '../components/ui';
import { navigate } from '../router';
import { useStore } from '../store';

/** Staff sign-in. Placeholder; the staff-app module owns the real screen. */
export default function Login({ next }: { next: string | null }) {
  const { signIn, district } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="grid h-full place-items-center bg-slate-100 p-6">
      <form
        className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await signIn(email, password)) navigate(next || '/org');
        }}
      >
        <Logo />
        <p className="text-sm text-slate-600">Staff sign-in for {district.name}</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-brand"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-brand"
        />
        <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark">Sign in</button>
      </form>
    </div>
  );
}
