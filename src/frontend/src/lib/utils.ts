import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // ⚡ Fallback for HTTP IP (your case: 91.108.112.198)
    const textarea = document.createElement('textarea');
    textarea.value = text;

    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const success = document.execCommand('copy');

    document.body.removeChild(textarea);

    return success;
  } catch (err) {
    console.error('Clipboard error:', err);
    return false;
  }
};

export const getSourceBadgeColor = (source: string) => {
  const map: Record<string, string> = {
    form: 'bg-blue-100 text-blue-800',
    api: 'bg-purple-100 text-purple-800',
    repost: 'bg-amber-100 text-amber-800',
  };
  return map[source] || 'bg-gray-100 text-gray-800';
};

export const getStatusBadgeColor = (status: string) => {
  const map: Record<string, string> = {
    sent: 'bg-green-100 text-green-800',
    valid: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    invalid: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
};

export const getCallStatusBadgeColor = (status: string) => {
  const map: Record<string, string> = {
    valid: 'bg-green-100 text-green-800',
    call_before_lead: 'bg-red-100 text-red-800',
    unmatched: 'bg-amber-100 text-amber-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
};

export const callStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    valid: 'Valid',
    call_before_lead: 'Call before lead',
    unmatched: 'Unmatched',
  };
  return map[status] || status;
};

// Format a US phone number for display: 3154568778 -> (315) 456-8778
export const formatUsPhone = (raw?: string | null): string => {
  if (!raw) return '—';
  const digits = String(raw).replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return String(raw);
};

// Local YYYY-MM-DD (for date inputs / "today" defaults)
export const todayStr = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const formatPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

// Human-readable provider/destination label + badge color for a campaign
export const providerLabel = (destination?: string): string => {
  const map: Record<string, string> = {
    ringba_regular: 'Ringba',
    ringba_rtb: 'Ringba RTB',
    callgrid: 'CallGrid',
    ringba_regular_and_callgrid: 'Ringba + CallGrid',
    ringba_rtb_and_callgrid: 'Ringba RTB + CallGrid',
  };
  return map[destination || ''] || destination || '—';
};

export const providerBadgeColor = (destination?: string): string => {
  if (!destination) return 'bg-gray-100 text-gray-800';
  if (destination.includes('callgrid') && destination.includes('ringba')) return 'bg-purple-100 text-purple-800';
  if (destination.includes('callgrid')) return 'bg-teal-100 text-teal-800';
  if (destination.includes('rtb')) return 'bg-orange-100 text-orange-800';
  return 'bg-blue-100 text-blue-800';
};
