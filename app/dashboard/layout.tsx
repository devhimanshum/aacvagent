'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { AlertTriangle } from 'lucide-react';
import { ProcessingProvider } from '@/lib/contexts/processing-context';
import { AutoProcessBar } from '@/components/dashboard/AutoProcessBar';
import { useStats, useCandidates } from '@/hooks/useCandidates';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !error) {
      router.push('/login');
    }
  }, [user, loading, error, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #040e1e 0%, #071730 50%, #0d254a 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-blue-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white" style={{ fontFamily: 'Georgia, serif' }}>Shipivishta</p>
            <p className="text-xs text-blue-300/60 mt-0.5">Connecting…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-50 p-4">
        <div className="max-w-md w-full rounded-2xl border border-red-100 bg-white p-7 text-center shadow-navy">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <AlertTriangle className="h-7 w-7 text-maritime-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">Firebase Connection Failed</h2>
          <p className="text-sm text-slate-500 mb-5">{error}</p>
          <div className="rounded-xl bg-slate-50 p-4 text-left text-xs text-slate-600 space-y-1.5 border border-slate-100">
            <p className="font-semibold text-slate-700 mb-1">Checklist:</p>
            <p>1. Enable Email/Password authentication in Firebase Console</p>
            <p>2. Add your deployment domain to Firebase → Authentication → Authorized Domains</p>
            <p>3. Check browser console for the exact error details</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <DashboardShell>{children}</DashboardShell>;
}

// ── Inner shell — has access to hooks after auth guard ────────
function DashboardShell({ children }: { children: React.ReactNode }) {
  const { refetch: refetchStats }      = useStats();
  const { refetch: refetchCandidates } = useCandidates();

  const handleComplete = useCallback((added: number) => {
    if (added > 0) {
      refetchStats();
      refetchCandidates();
    }
  }, [refetchStats, refetchCandidates]);

  return (
    <ProcessingProvider onComplete={handleComplete}>
      <div className="flex h-screen overflow-hidden bg-surface-50">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* AutoProcessBar sits here — persists across ALL tab changes */}
          <AutoProcessBar />
          {children}
        </main>
      </div>
    </ProcessingProvider>
  );
}
