'use client';

import { motion } from 'framer-motion';
import { Mail, Paperclip, CheckCircle2, Clock, AlertTriangle, Play } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmailLink } from '@/components/ui/ContactLink';
import { formatDate, timeAgo, truncate } from '@/lib/utils/helpers';
import type { OutlookEmail } from '@/types';

interface EmailListProps {
  emails: OutlookEmail[];
  processing: boolean;
  onProcessSingle?: (emailId: string) => void;
  onProcessAll?: () => void;
}

export function EmailList({ emails, processing, onProcessSingle, onProcessAll }: EmailListProps) {
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Mail className="h-12 w-12 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500">No emails found</p>
        <p className="text-xs text-slate-400 mt-1">Connect Outlook in Settings and click Refresh</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {onProcessAll && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={onProcessAll}
            loading={processing}
            icon={<Play className="h-3.5 w-3.5" />}
          >
            Process All Unprocessed
          </Button>
        </div>
      )}

      {emails.map((email, i) => (
        <motion.div
          key={email.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
          className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-all"
        >
          {/* Status icon */}
          <div className="mt-0.5 shrink-0">
            {email.processed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Clock className="h-5 w-5 text-slate-300" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {email.subject || '(no subject)'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  {email.from?.emailAddress?.name && (
                    <span className="text-xs text-slate-500">{email.from.emailAddress.name}</span>
                  )}
                  {email.from?.emailAddress?.address && (
                    <EmailLink email={email.from.emailAddress.address} size="xs" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {email.hasAttachments && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Paperclip className="h-3.5 w-3.5" />
                  </span>
                )}
                <Badge variant={email.processed ? 'success' : 'neutral'}>
                  {email.processed ? 'Processed' : 'Pending'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-400">
                {timeAgo(email.receivedDateTime)}
              </p>
              {!email.processed && onProcessSingle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onProcessSingle(email.id)}
                  loading={processing}
                  icon={<Play className="h-3 w-3" />}
                >
                  Process
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
