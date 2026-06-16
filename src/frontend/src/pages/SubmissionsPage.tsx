import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { submissionService, campaignService, publisherService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent } from '@/components/ui/index';
import { Badge } from '@/components/ui/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import {
  Search, RefreshCw, ChevronDown, ChevronUp, Loader2,
  CheckCircle, XCircle, Minus, ClipboardList, Trash2,
} from 'lucide-react';
import { getStatusBadgeColor, getSourceBadgeColor, todayStr, formatEstFull } from '@/lib/utils';
import type { Submission, Campaign } from '@/types';

// ── EST timestamp formatter ────────────────────────────────────────────────────
// Shows full date + time with seconds in Eastern Time
const formatEST = (iso: string): { date: string; time: string } => {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);

  const datePart = d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit', day: '2-digit', year: 'numeric',
  });

  const timePart = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  });

  return { date: datePart, time: timePart };
};

export default function SubmissionsPage() {
  const { user } = useAuthStore();
  const qc       = useQueryClient();

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin      = user?.role === 'admin';
  const isAgent      = user?.role === 'agent';

  const [page,        setPage]        = useState(1);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [showReset,   setShowReset]   = useState(false);

  // Default to today's records (Eastern).
  const [filters, setFilters] = useState({
    search:    '',
    publisher: '',
    campaign:  '',
    source:    '',
    status:    '',
    fraud:     '',
    from:      todayStr(),
    to:        todayStr(),
  });

  const PAGE_SIZE = 20;

  // ── Queries ──────────────────────────────────────────────────────────────────
  // Instant search: query key includes filters so each keystroke refetches.
  // Real-time: poll every 15s.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['submissions', filters, page],
    queryFn: () => submissionService.getAll({
      phone:     filters.search    || undefined,
      publisher: filters.publisher || undefined,
      campaign:  filters.campaign  || undefined,
      source:    filters.source    || undefined,
      status:    filters.status    || undefined,
      fraud:     filters.fraud     || undefined,
      from:      filters.from      || undefined,
      to:        filters.to        || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  // Campaigns — scoped to selected publisher for super_admin
  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns-list', filters.publisher],
    queryFn: () => campaignService.getAll({
      limit:     100,
      publisher: filters.publisher || undefined,
    }),
  });

  // Publishers — super_admin only
  const { data: publishersData } = useQuery({
    queryKey: ['publishers-list'],
    queryFn:  () => publisherService.getAll({ limit: 100 }),
    enabled:  isSuperAdmin,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const repostMutation = useMutation({
    mutationFn: ({ id, targetCampaignId }: { id: string; targetCampaignId: string }) =>
      submissionService.repost(id, targetCampaignId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions'] });
      toast.success('Lead reposted successfully!');
      setRepostingId(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Repost failed.');
      setRepostingId(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      (submissionService as any).reset(),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['submissions'] });
      toast.success(res.data.data.message);
      setShowReset(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Reset failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => submissionService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions'] });
      toast.success('Submission deleted.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed.'),
  });

  // ── Data ──────────────────────────────────────────────────────────────────────
  const submissions: Submission[] = data?.data?.data || [];
  const meta                      = data?.data?.meta;
  const campaigns: Campaign[]     = campaignsData?.data?.data || [];
  const publishers                = publishersData?.data?.data || [];

  const setFilter = (key: string, value: string) => {
    const v = value === 'all' ? '' : value;
    if (key === 'publisher') {
      setFilters((p) => ({ ...p, publisher: v, campaign: '' }));
    } else {
      setFilters((p) => ({ ...p, [key]: v }));
    }
    setPage(1);
  };

  const ValidationIcon = ({ valid, enabled }: { valid?: boolean; enabled: boolean }) => {
    if (!enabled) return <Minus className="h-4 w-4 text-slate-300" />;
    return valid
      ? <CheckCircle className="h-4 w-4 text-emerald-500" />
      : <XCircle    className="h-4 w-4 text-red-500" />;
  };

  // ── Table col count for expandedRow colSpan ───────────────────────────────────
  // # | Phone | Campaign | Publisher? | Agent? | Source | J | TF | Status | Date | Time | Actions
  const baseCols = 10; // # Phone Campaign Source J TF Status Date Time Actions
  const colCount = baseCols + (isSuperAdmin ? 2 : isAdmin ? 1 : 0);

  return (
    <div className="page-container space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            {meta?.total ?? '—'} total{' '}
            {isFetching && <span className="text-blue-500">· refreshing...</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['submissions'] })}>
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
          {/* Reset — super_admin only */}
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowReset(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />Reset CRM
            </Button>
          )}
        </div>
      </div>

      {/* Reset confirmation modal */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <Trash2 className="h-10 w-10 text-destructive mx-auto mb-3" />
                <h2 className="font-semibold text-base">Reset All Submissions</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This permanently deletes <strong>all submission records</strong> across all publishers.
                  The CRM will start fresh from 0.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowReset(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  loading={resetMutation.isPending}
                  onClick={() => resetMutation.mutate()}
                >
                  Yes, Reset All
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2.5">

            {/* Phone search */}
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Phone..." className="pl-8 h-8 text-xs" value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)} />
            </div>

            {/* Publisher — super_admin only */}
            {isSuperAdmin && (
              <Select value={filters.publisher || 'all'} onValueChange={(v) => setFilter('publisher', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All publishers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All publishers</SelectItem>
                  {publishers.map((p: any) => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Campaign */}
            <Select value={filters.campaign || 'all'} onValueChange={(v) => setFilter('campaign', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Source */}
            <Select value={filters.source || 'all'} onValueChange={(v) => setFilter('source', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="form">Form</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="repost">Repost</SelectItem>
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={filters.status || 'all'} onValueChange={(v) => setFilter('status', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
              </SelectContent>
            </Select>

            {/* Fraud (call before lead) */}
            <Select value={filters.fraud || 'all'} onValueChange={(v) => setFilter('fraud', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All leads" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All leads</SelectItem>
                <SelectItem value="true">Fraud only</SelectItem>
                <SelectItem value="false">Clean only</SelectItem>
              </SelectContent>
            </Select>

            {/* Date range */}
            <Input type="date" className="h-8 text-xs" value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)} />
            <Input type="date" className="h-8 text-xs" value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <ClipboardList className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No submissions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Campaign</th>
                    {isSuperAdmin && (
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Publisher</th>
                    )}
                    {!isAgent && (
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Agent</th>
                    )}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Source</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">J</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">TF</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date (EST)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Time (EST)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((sub, i) => {
                    const est = formatEST(sub.createdAt);
                    const rowIndex = (page - 1) * PAGE_SIZE + i; // newest starts at 0
                    const isFraud = !!sub.callBeforeLead;
                    return (
                      <>
                        <tr
                          key={sub._id}
                          className={`transition-colors cursor-pointer ${isFraud ? 'bg-red-50 hover:bg-red-100/70' : 'hover:bg-slate-50/80'}`}
                          onClick={() => setExpandedId(expandedId === sub._id ? null : sub._id)}
                        >
                          {/* Index — newest = 0 */}
                          <td className="px-4 py-3 text-xs font-mono text-slate-400">{rowIndex}</td>

                          {/* Phone */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {expandedId === sub._id
                                ? <ChevronUp   className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                : <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                              <code className={`text-xs font-mono ${isFraud ? 'text-red-700 font-semibold' : 'text-slate-700'}`}>{sub.phone ||  '—'}</code>
                              {isFraud && (
                                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">FRAUD</span>
                              )}
                              {sub.isDuplicate && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">DUP{sub.attemptCount ? ` ${sub.attemptCount}` : ''}</span>
                              )}
                            </div>
                          </td>

                          {/* Campaign — null-safe */}
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {sub.campaign && typeof sub.campaign === 'object'
                              ? (sub.campaign as any).name || '—'
                              : '—'}
                          </td>

                          {/* Publisher — super_admin only */}
                          {isSuperAdmin && (
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {sub.publisher && typeof sub.publisher === 'object'
                                ? (sub.publisher as any).name || '—'
                                : '—'}
                            </td>
                          )}

                          {/* Agent — admin + super_admin */}
                          {!isAgent && (
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {sub.agent && typeof sub.agent === 'object'
                                ? (sub.agent as any).name || '—'
                                : '—'}
                            </td>
                          )}

                          {/* Source */}
                          <td className="px-4 py-3">
                            <Badge className={getSourceBadgeColor(sub.source)}>{sub.source}</Badge>
                          </td>

                          {/* Jornaya */}
                          <td className="px-4 py-3">
                            <ValidationIcon valid={sub.jornaya?.valid} enabled={sub.jornaya?.enabled} />
                          </td>

                          {/* TrustedForm */}
                          <td className="px-4 py-3">
                            <ValidationIcon valid={sub.trustedForm?.valid} enabled={sub.trustedForm?.enabled} />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <Badge className={getStatusBadgeColor(sub.status)}>{sub.status}</Badge>
                          </td>

                          {/* Date EST */}
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {est.date}
                          </td>

                          {/* Time EST — with seconds */}
                          <td className="px-4 py-3">
                            <code className="text-xs font-mono text-slate-700 whitespace-nowrap">
                              {est.time}
                            </code>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <RepostMenu
                                submissionId={sub._id}
                                currentCampaignId={
                                  sub.campaign && typeof sub.campaign === 'object'
                                    ? (sub.campaign as any)._id
                                    : String(sub.campaign)
                                }
                                campaigns={campaigns}
                                isLoading={repostingId === sub._id && repostMutation.isPending}
                                onRepost={(targetId) => {
                                  setRepostingId(sub._id);
                                  repostMutation.mutate({ id: sub._id, targetCampaignId: targetId });
                                }}
                              />
                              {isSuperAdmin && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete submission"
                                  onClick={() => { if (confirm('Delete this submission permanently?')) deleteMutation.mutate(sub._id); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {expandedId === sub._id && (
                          <tr key={`${sub._id}-exp`} className="bg-slate-50/60">
                            <td colSpan={colCount} className="px-6 py-4">

                              {/* Field data grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 mb-3">
                                {sub.data && Object.entries(sub.data)
                                  .filter(([k]) => !k.startsWith('_'))
                                  .map(([key, val]) => (
                                    <div key={key} className="bg-white rounded-lg p-2.5 border border-slate-100 shadow-sm">
                                      <p className="text-xs text-slate-400 mb-0.5">{key}</p>
                                      <p className="text-sm font-medium text-slate-700 truncate">{String(val ?? '—')}</p>
                                    </div>
                                  ))}
                              </div>

                              {/* Destination results */}
                              {(sub as any).destinationResults &&
                               Object.keys((sub as any).destinationResults).length > 0 && (
                                <div className="flex gap-2 flex-wrap mb-2">
                                  {Object.entries((sub as any).destinationResults).map(([dest, result]: [string, any]) => (
                                    <div key={dest}
                                      className={`text-xs px-2.5 py-1.5 rounded-full font-medium ${result.sent ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                      {dest}: {result.sent ? '✓ sent' : `✗ ${result.error || 'failed'}`}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Super-admin enrichment mapping — final URL + request payload + response.
                                  NO masking for super_admin. Hidden from agents/admins. */}
                              {isSuperAdmin && (sub as any).destinationResults &&
                               Object.keys((sub as any).destinationResults).length > 0 && (
                                <div className="space-y-3 mt-3 border-t border-slate-200 pt-3">
                                  <p className="text-xs font-semibold text-slate-500 uppercase">Enrichment mapping (super admin)</p>
                                  {Object.entries((sub as any).destinationResults).map(([dest, result]: [string, any]) => (
                                    <div key={dest} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-700">{result.request?.provider || dest}</span>
                                        <span className={`text-xs font-medium ${result.sent ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {result.sent ? 'sent' : (result.error || 'failed')}
                                        </span>
                                      </div>

                                      {result.request?.uniqueKey && (
                                        <p className="text-xs text-slate-500">unique_key: <code className="text-slate-700">{result.request.uniqueKey}</code></p>
                                      )}

                                      {result.request?.fullUrl && (
                                        <div>
                                          <p className="text-xs text-slate-400 mb-0.5">Final API URL</p>
                                          <code className="block text-xs font-mono text-slate-700 break-all bg-slate-50 rounded p-2">{result.request.fullUrl}</code>
                                        </div>
                                      )}

                                      {result.response !== undefined && result.response !== null && (
                                        <div>
                                          <p className="text-xs text-slate-400 mb-0.5">API response</p>
                                          <pre className="text-[11px] font-mono text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto max-h-40">{
                                            typeof result.response === 'string' ? result.response : JSON.stringify(result.response, null, 2)
                                          }</pre>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Ringba error */}
                              {!sub.ringba?.sent && sub.ringba?.error && (
                                <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-600">
                                  <strong>Ringba error:</strong> {sub.ringba.error}
                                </div>
                              )}

                              {/* Full timestamp — exact EST form submission time */}
                              <p className="text-xs text-slate-400 mt-2">
                                Form submitted (EST): <span className="font-medium text-slate-600">{formatEstFull(sub.createdAt)}</span>
                              </p>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.pages} · {meta.total} total
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Repost dropdown — available to ALL roles ───────────────────────────────────
function RepostMenu({ submissionId, currentCampaignId, campaigns, isLoading, onRepost }: {
  submissionId: string;
  currentCampaignId: string;
  campaigns: Campaign[];
  isLoading: boolean;
  onRepost: (campaignId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (campaigns.length === 0) return null;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}
        disabled={isLoading} className="text-xs h-7">
        {isLoading
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <RefreshCw className="h-3 w-3 mr-1" />}
        Repost
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <p className="text-xs text-slate-400 px-3 py-2 border-b bg-slate-50">Send to campaign:</p>
            <div className="max-h-52 overflow-y-auto">
              {campaigns.map((c) => (
                <button key={c._id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors truncate flex items-center justify-between
                    ${c._id === currentCampaignId ? 'bg-blue-50/50' : ''}`}
                  onClick={() => { onRepost(c._id); setOpen(false); }}>
                  <span className="truncate">{c.name}</span>
                  {c._id === currentCampaignId && (
                    <span className="text-xs text-blue-400 ml-2 flex-shrink-0">current</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}