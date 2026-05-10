'use client';


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Mail, Lock, LogIn, Anchor, Ship } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

/* ── Animated wave divider ── */
function WaveDivider() {
  return (
    <svg viewBox="0 0 1440 120" className="absolute bottom-0 left-0 w-full" preserveAspectRatio="none">
      <path
        d="M0,60 C240,100 480,20 720,60 C960,100 1200,20 1440,60 L1440,120 L0,120 Z"
        fill="rgba(255,255,255,0.04)"
      />
      <path
        d="M0,80 C360,40 720,100 1080,60 C1260,44 1380,72 1440,80 L1440,120 L0,120 Z"
        fill="rgba(255,255,255,0.06)"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const { signIn, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        toast.error('Invalid email or password');
      } else if (code === 'auth/user-not-found') {
        toast.error('No account found with this email');
      } else {
        toast.error('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel: brand ── */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #040e1e 0%, #071730 35%, #0d254a 70%, #163863 100%)' }}>

        {/* Background grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Glow orbs */}
        <div className="absolute top-20 left-20 h-64 w-64 rounded-full bg-blue-500/8 blur-3xl" />
        <div className="absolute bottom-32 right-12 h-48 w-48 rounded-full bg-maritime-600/10 blur-3xl" />

        {/* Wave divider at bottom */}
        <WaveDivider />

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 text-center"
        >
          {/* Logo emblem */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center justify-center mb-10"
            style={{ filter: 'drop-shadow(0 4px 24px rgba(37,99,235,0.30))' }}
          >
            <Image
              src="/logo.svg"
              alt="Logo"
              width={447}
              height={373}
              className="rounded-2xl object-contain"
              style={{ width: 220, height: 'auto' }}
              priority
            />
          </motion.div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-10">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-blue-400/20" />
            <Anchor className="h-4 w-4 text-blue-400/40" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-blue-400/20" />
          </div>

          {/* Tagline */}
          <p className="text-slate-300 text-lg font-light leading-relaxed max-w-xs mx-auto">
            AI-Powered Maritime Crew<br/>
            <span className="text-blue-300 font-medium">CV Screening Platform</span>
          </p>

          {/* Feature pills */}
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {['Smart CV Analysis', 'Rank Matching', 'Crew Management'].map(f => (
              <span key={f} className="rounded-full px-3 py-1 text-[11px] font-medium text-blue-200/70"
                style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)' }}>
                {f}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Bottom ship icon */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 opacity-10"
        >
          <Ship className="h-16 w-16 text-blue-300" />
        </motion.div>
      </div>

      {/* ── Right panel: login form ── */}
      <div className="flex flex-1 items-center justify-center p-8 bg-surface-50">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div className="flex items-center justify-center rounded-2xl overflow-hidden bg-[#000000]"
              style={{ boxShadow: '0 4px 16px rgba(7,23,48,0.3)', padding: 4 }}>
              <Image
                src="/logo.svg"
                alt="Logo"
                width={447}
                height={373}
                className="rounded-xl object-contain"
                style={{ width: 88, height: 'auto' }}
              />
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-navy-900 tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-400">Sign in to your admin account</p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl bg-white p-7 shadow-navy border border-slate-100">
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@shipivishta.com"
                    required
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-400 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-300" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-400 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-70"
                style={{
                  background: loading
                    ? '#1d4ed8'
                    : 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                }}
              >
                {loading ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="mt-5 text-center text-[11px] text-slate-400">
            Admin accounts are managed via Firebase Authentication.
          </p>

          {/* Brand bottom */}
          <div className="mt-8 flex items-center justify-center gap-2">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] text-slate-300 font-medium uppercase tracking-widest">
              Shipivishta © 2025
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
