'use client';

/**
 * ContactLink — clickable email & phone links used everywhere in the admin panel.
 *
 * Email → opens Outlook web compose (direct send box)
 * Phone → opens WhatsApp chat
 */

import { Mail, Phone, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils/helpers';

// ── Outlook compose URL (opens directly to a new email to that address) ──
function outlookComposeUrl(email: string) {
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(email)}`;
}

// ── WhatsApp deep-link (strips all non-digit chars; keeps leading country code) ──
function whatsappUrl(phone: string) {
  // Remove everything except digits and leading +
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  return `https://wa.me/${digits}`;
}

// ── Shared size variants ──────────────────────────────────────
const sizes = {
  xs: 'text-[11px] gap-1',
  sm: 'text-xs gap-1',
  md: 'text-sm gap-1.5',
};

const iconSizes = {
  xs: 'h-3 w-3',
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
};

// ── EmailLink ─────────────────────────────────────────────────
interface EmailLinkProps {
  email:     string;
  size?:     keyof typeof sizes;
  className?: string;
  /** Truncate long addresses in compact contexts */
  truncate?: boolean;
}

export function EmailLink({ email, size = 'xs', className, truncate = false }: EmailLinkProps) {
  if (!email) return null;
  return (
    <a
      href={outlookComposeUrl(email)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={cn(
        'inline-flex items-center font-medium rounded-md',
        'text-slate-500 hover:text-blue-600 hover:bg-blue-50',
        'transition-colors cursor-pointer px-1.5 py-0.5 -mx-1.5 -my-0.5',
        sizes[size],
        className,
      )}
      title={`Compose email to ${email} in Outlook`}
    >
      <Mail className={cn(iconSizes[size], 'shrink-0')} />
      <span className={truncate ? 'truncate max-w-[160px]' : ''}>{email}</span>
    </a>
  );
}

// ── PhoneLink ─────────────────────────────────────────────────
interface PhoneLinkProps {
  phone:      string;
  size?:      keyof typeof sizes;
  className?: string;
}

export function PhoneLink({ phone, size = 'xs', className }: PhoneLinkProps) {
  if (!phone) return null;
  return (
    <a
      href={whatsappUrl(phone)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={cn(
        'inline-flex items-center font-medium rounded-md',
        'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50',
        'transition-colors cursor-pointer px-1.5 py-0.5 -mx-1.5 -my-0.5',
        sizes[size],
        className,
      )}
      title={`Open WhatsApp chat with ${phone}`}
    >
      <MessageCircle className={cn(iconSizes[size], 'shrink-0 text-emerald-500')} />
      <span>{phone}</span>
    </a>
  );
}

// ── ContactRow — email + phones side by side ─────────────────
interface ContactRowProps {
  email?:     string;
  phone?:     string;        // legacy (backward-compat)
  phones?:    string[];      // up to 2 phones
  size?:      keyof typeof sizes;
  className?: string;
  truncate?:  boolean;
}

export function ContactRow({ email, phone, phones, size = 'xs', className, truncate }: ContactRowProps) {
  const phoneList = phones?.length ? phones : phone ? [phone] : [];
  if (!email && phoneList.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {email && <EmailLink email={email} size={size} truncate={truncate} />}
      {phoneList.map((p, i) => <PhoneLink key={i} phone={p} size={size} />)}
    </div>
  );
}
