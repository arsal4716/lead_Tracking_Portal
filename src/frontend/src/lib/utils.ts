import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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
