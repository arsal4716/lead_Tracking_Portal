import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EST_TZ = 'America/New_York';

// All timestamps display in Eastern Time.
export const formatDate = (date: string) =>
  new Date(date).toLocaleString('en-US', {
    timeZone: EST_TZ,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

// Precise EST timestamp matching the CallGrid portal format:
//   "Jun 15, 2026, 7:16:16 PM"
export const formatEstFull = (date?: string | null): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: EST_TZ,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
};

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

// Today's date in Eastern Time as YYYY-MM-DD (for "today" defaults / date inputs).
// en-CA yields YYYY-MM-DD.
export const todayStr = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: EST_TZ }).format(new Date());

// Human-readable signed duration between a call and a lead submission.
// Returns the magnitude + which event came first.
export const timeGap = (callIso?: string, leadIso?: string): { label: string; fraud: boolean } | null => {
  if (!callIso || !leadIso) return null;
  const call = new Date(callIso).getTime();
  const lead = new Date(leadIso).getTime();
  if (isNaN(call) || isNaN(lead)) return null;

  const diff = Math.abs(lead - call);
  const secs = Math.floor(diff / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts = [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');

  // Fraud when the call arrived before the lead was submitted.
  const fraud = call < lead;
  return { label: `${parts} (${fraud ? 'call first' : 'lead first'})`, fraud };
};

// Extract the unique provider key to display per campaign destination.
export const campaignProviderKey = (c: any): string => {
  const dest: string = c?.destination || '';
  const fromUrl = (url?: string): string => {
    if (!url) return '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    } catch {
      const noQuery = String(url).split('?')[0];
      const parts = noQuery.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    }
  };

  if (dest === 'callgrid') return fromUrl(c.callgridUrl) || '—';
  if (dest === 'ringba_rtb') return c.ringbaRtbKey || fromUrl(c.ringbaRtbUrl) || '—';
  if (dest.includes('callgrid') && dest.includes('rtb'))
    return [c.ringbaRtbKey || fromUrl(c.ringbaRtbUrl), fromUrl(c.callgridUrl)].filter(Boolean).join(' · ') || '—';
  if (dest.includes('callgrid'))
    return [c.ringbaId, fromUrl(c.callgridUrl)].filter(Boolean).join(' · ') || '—';
  return c.ringbaId || '—';
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
