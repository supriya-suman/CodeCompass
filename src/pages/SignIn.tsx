import { useEffect, useRef, useState } from 'react';
import { authErrorMessage, RetryError, useAccount } from '../app/account';
import { BRAND } from '../app/brand';
import { useOnline } from '../app/pwa';
import { Button, Field, Input, Select } from '../components/ui';
import { authMethods } from '../lib/cloud/firebase';

const COUNTRIES = [
  { code: '+91', label: 'India (+91)', digits: [10, 10] },
  { code: '+1', label: 'US / Canada (+1)', digits: [10, 10] },
  { code: '+44', label: 'United Kingdom (+44)', digits: [9, 10] },
  { code: '+971', label: 'UAE (+971)', digits: [8, 9] },
  { code: '+65', label: 'Singapore (+65)', digits: [8, 8] },
  { code: '+61', label: 'Australia (+61)', digits: [9, 9] }
] as const;

const errorText = (e: unknown) => (e instanceof RetryError ? e.message : authErrorMessage(e));

function useCountdown() {
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return [wait, setWait] as const;
}

function CodeInput({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <Input
      id="otp-code"
      ref={inputRef}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      className="tabular text-center text-xl tracking-[0.4em]"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );
}

function EmailSignIn({ busy, setBusy }: { busy: boolean; setBusy: (b: boolean) => void }) {
  const { sendEmailCode, verifyEmailCode } = useAccount();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useCountdown();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  async function send(to: string) {
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim())) return setError('Enter a valid email address.');
    setBusy(true);
    try {
      setWait(await sendEmailCode(to.trim()));
      setSentTo(to.trim());
      setCode('');
    } catch (e) {
      setError(errorText(e));
      if (e instanceof RetryError && e.retryAfterSec) setWait(e.retryAfterSec);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError('');
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      await verifyEmailCode(sentTo!, code);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(email);
        }}
      >
        <Field label="Email" error={error || undefined}>
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <Button type="submit" variant="primary" disabled={busy || !online || wait > 0}>
          {busy ? 'Sending code…' : wait > 0 ? `Try again in ${wait}s` : 'Email me a code'}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <p className="text-sm text-muted">
        We sent a 6-digit code to <strong className="text-ink">{sentTo}</strong>. It expires in 10 minutes. Check spam if it isn’t in your inbox.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="otp-code" className="text-sm font-medium">
          6-digit code
        </label>
        <CodeInput value={code} onChange={setCode} inputRef={codeRef} />
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : 'Verify and sign in'}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setSentTo(null); setError(''); }}>
          Change email
        </Button>
        <Button variant="ghost" size="sm" disabled={wait > 0 || busy} onClick={() => void send(sentTo)}>
          {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
        </Button>
      </div>
    </form>
  );
}

function PhoneSignIn({ busy, setBusy, keep }: { busy: boolean; setBusy: (b: boolean) => void; keep: boolean }) {
  const { startSignIn, confirmCode, codeSent, resetSignIn } = useAccount();
  const online = useOnline();
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]['code']>('+91');
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useCountdown();
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (codeSent) codeRef.current?.focus();
  }, [codeSent]);

  const c = COUNTRIES.find((x) => x.code === country)!;
  const digits = number.replace(/\D/g, '').replace(/^0+/, '');
  const valid = digits.length >= c.digits[0] && digits.length <= c.digits[1] && (country !== '+91' || /^[6-9]/.test(digits));
  const e164 = `${country}${digits}`;

  async function send() {
    setError('');
    if (!valid) return setError(country === '+91' ? 'Enter a 10-digit Indian mobile number.' : 'Check the number of digits for this country.');
    setBusy(true);
    try {
      await startSignIn(e164, keep, recaptchaRef.current!);
      setWait(30);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setError('');
    setBusy(true);
    try {
      await confirmCode(code);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <>
      {!codeSent ? (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field label="Country">
            {(id) => (
              <Select id={id} value={country} onChange={(e) => setCountry(e.target.value as typeof country)}>
                {COUNTRIES.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Mobile number" error={error || undefined}>
            {(id) => (
              <div className="flex items-center gap-2">
                <span className="tabular rounded-lg border border-line bg-sunken px-3 py-2.5 text-muted">{country}</span>
                <Input id={id} type="tel" inputMode="numeric" autoComplete="tel-national" value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
            )}
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !online}>
            {busy ? 'Sending code…' : 'Send code by SMS'}
          </Button>
        </form>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="text-sm text-muted">We sent a 6-digit code to {e164}.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="otp-code" className="text-sm font-medium">
              6-digit code
            </label>
            <CodeInput value={code} onChange={setCode} inputRef={codeRef} />
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Verify and sign in'}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => { resetSignIn(); setCode(''); setError(''); }}>
              Change number
            </Button>
            <Button variant="ghost" size="sm" disabled={wait > 0 || busy} onClick={() => void send()}>
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </Button>
          </div>
        </form>
      )}
      <div ref={recaptchaRef} />
    </>
  );
}

export default function SignIn({ onExploreDemo }: { onExploreDemo: () => void }) {
  const { signInWithGoogle, setKeepSignedIn } = useAccount();
  const online = useOnline();
  const [method, setMethod] = useState<'email' | 'phone'>(authMethods.email ? 'email' : 'phone');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleError, setGoogleError] = useState('');

  // Apply the "keep me signed in" choice before any sign-in starts.
  useEffect(() => {
    void setKeepSignedIn(keep);
  }, [keep, setKeepSignedIn]);

  async function google() {
    setGoogleError('');
    setBusy(true);
    try {
      // No await before this call: the popup must open inside the click.
      await signInWithGoogle();
    } catch (e) {
      setGoogleError(errorText(e));
      setBusy(false);
    }
  }

  const codeMethods = (authMethods.email ? 1 : 0) + (authMethods.phone ? 1 : 0);

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-10 w-10" />
          <span className="font-display text-2xl font-semibold">{BRAND.name}</span>
        </div>
        <h1 className="text-2xl font-semibold">Sign in or create your account</h1>
        <p className="mt-1 text-muted">One account per person. Your records, profiles and plans are private to you and sync to every device you sign in on.</p>

        {!online && (
          <p role="status" className="mt-4 rounded-lg bg-sunken p-3 text-sm text-muted">
            You’re offline. Connect to the internet to sign in.
          </p>
        )}

        {codeMethods > 1 && (
          <div role="tablist" aria-label="Sign-in method" className="mt-6 inline-flex rounded-lg border border-line bg-sunken p-0.5">
            {(['email', 'phone'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={method === m}
                onClick={() => setMethod(m)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium ${method === m ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
              >
                {m === 'email' ? 'Email code' : 'SMS code'}
              </button>
            ))}
          </div>
        )}

        {codeMethods > 0 && (
          <div className="mt-6">{method === 'email' && authMethods.email ? <EmailSignIn busy={busy} setBusy={setBusy} /> : <PhoneSignIn busy={busy} setBusy={setBusy} keep={keep} />}</div>
        )}

        {authMethods.google && (
          <div className="mt-6 grid gap-2">
            {codeMethods > 0 && <p className="text-center text-sm text-muted">or</p>}
            <Button variant={codeMethods > 0 ? 'secondary' : 'primary'} disabled={busy || !online} onClick={() => void google()}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Zm-5.6-8c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14ZM12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z" />
              </svg>
              Continue with Google
            </Button>
            {googleError && (
              <p role="alert" className="text-sm text-danger">
                {googleError}
              </p>
            )}
          </div>
        )}

        <label className="mt-6 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>
            Keep me signed in on this device
            <span className="block text-muted">Turn this off on a shared or public computer.</span>
          </span>
        </label>

        <div className="mt-8 border-t border-line pt-6 text-sm text-muted">
          <p>New here? Signing in with a new email creates your account. CodeCompass never asks for passwords to LinkedIn, GitHub or coding platforms.</p>
          <button type="button" onClick={onExploreDemo} className="mt-3 font-semibold text-accent underline">
            Explore with demo data first
          </button>
        </div>
      </div>
    </div>
  );
}
