'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Inbox, UserCheck, UserX, Settings,
  SlidersHorizontal, LogOut, ChevronLeft, ChevronRight,
  Anchor, UploadCloud, Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils/helpers';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const navItems = [
  { href: '/dashboard',            icon: LayoutDashboard,   label: 'Dashboard',   desc: 'Overview' },
  { href: '/dashboard/inbox',      icon: Inbox,             label: 'Inbox',       desc: 'Emails' },
  { href: '/dashboard/upload',     icon: UploadCloud,       label: 'Upload CVs',  desc: 'Drag & Drop' },
  { href: '/dashboard/review',     icon: UserCheck,         label: 'Selected',    desc: 'Review CVs' },
  { href: '/dashboard/selected',   icon: Anchor,            label: 'Onboard',     desc: 'Onboarded' },
  { href: '/dashboard/unselected', icon: UserX,             label: 'Unselected',  desc: 'Rejected' },
  { href: '/dashboard/legacy',     icon: Archive,           label: 'Old CVs',     desc: 'Legacy Database' },
  { href: '/dashboard/config',     icon: SlidersHorizontal, label: 'Rank Config', desc: 'Criteria' },
  { href: '/dashboard/settings',   icon: Settings,          label: 'Settings',    desc: 'System' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname  = usePathname();
  const router    = useRouter();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    router.push('/login');
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col shrink-0 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #040e1e 0%, #071730 40%, #0d254a 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Subtle top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />

      {/* ── Logo / Brand ── */}
      <div
        className="relative flex h-[80px] items-center justify-center shrink-0 px-3 overflow-hidden"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo — scales between collapsed / expanded state */}
        <motion.div
          animate={{ width: collapsed ? 44 : 180 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center justify-center overflow-hidden"
        >
          <Image
            src="/logo.svg"
            alt="Logo"
            width={447}
            height={373}
            className="w-full h-auto rounded-lg object-contain"
            style={{ filter: 'drop-shadow(0 2px 12px rgba(37,99,235,0.20))' }}
            priority
          />
        </motion.div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                active
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}
            >
              {/* Active background */}
              {active && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'linear-gradient(90deg, rgba(37,99,235,0.35) 0%, rgba(37,99,235,0.12) 100%)' }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                />
              )}

              {/* Active left bar */}
              {active && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-blue-400" />
              )}

              {/* Icon */}
              <item.icon className={cn(
                'relative z-10 h-[18px] w-[18px] shrink-0 transition-colors',
                active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300',
              )} />

              {/* Label + desc */}
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative z-10 flex-1 whitespace-nowrap overflow-hidden"
                  >
                    <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
                    <span className={cn(
                      'block text-[10px] leading-tight mt-0.5',
                      active ? 'text-blue-300/70' : 'text-slate-600 group-hover:text-slate-500',
                    )}>{item.desc}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* ── Divider + version ── */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 pb-2"
          >
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <Anchor className="h-3 w-3 shrink-0" />
              <span className="truncate">Maritime CV Platform v1.0</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sign out ── */}
      <div className="p-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-maritime-600/15 hover:text-maritime-400 transition-all duration-150 group"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 transition-colors group-hover:text-maritime-400" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap text-[13px]"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-[86px] flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-navy-900 text-slate-400 shadow-lg hover:bg-navy-800 hover:text-white transition-colors z-20"
        style={{ background: '#0d254a' }}
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3" />
          : <ChevronLeft  className="h-3 w-3" />
        }
      </button>
    </motion.aside>
  );
}
