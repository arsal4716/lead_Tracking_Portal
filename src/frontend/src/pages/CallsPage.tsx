import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callService, campaignService, publisherService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent } from '@/components/ui/index';
import { Badge, Input } from '@/components/ui/index';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import { Search, RefreshCw, Loader2, PhoneCall, PhoneOff, ShieldAlert, Activity, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCallStatusBadgeColor, callStatusLabel, formatUsPhone, formatPct,
  formatEstFull, todayStr, timeGap,
} from '@/lib/utils';
import type { Call, CallStats, Campaign, Publisher } from '@/types';

export default function CallsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === 'super_admin';

  const [page, setPage] = useState(1);
  // Default to today's calls (Eastern).
  const [filters, setFilters] = useState({
    search: '', publisher: '', campaign: '', status: '', fraud: '', from: todayStr(), to: todayStr(),
  });

  const params = {
    phone:     filters.search    || undefined,
    publisher: filters.publisher || undefined,
    campaign:  filters.campaign  || undefined,
    status:    filters.status    || undefined,
    fraud:     filters.fraud     || undefined,
    from:      filters.from      || undefined,
    to:        filters.to        || undefined,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['calls', filters, page],
    queryFn: () => callService.getAll({ ...params, page, limit: 20 }),
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  const { data: statsData } = useQuery({
    queryKey: ['calls-stats', filters],
    queryFn: () => callService.getStats(params),
    refetchInterval: 15000,
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['calls-campaigns', filters.publisher],
    queryFn: () => campaignService.getAll({ limit: 100, publisher: filters.publisher || undefined }),
  });

  const { data: publishersData } = useQuery({
    queryKey: ['calls-publishers'],
    queryFn: () => publisherService.getAll({ limit: 100 }),
    enabled: isSuperAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => callService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calls'] });
      qc.invalidateQueries({ queryKey: ['calls-stats'] });
      toast.success('Call deleted.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed.'),
  });

  const calls: Call[]            = data?.data?.data || [];
  const meta                     = data?.data?.meta;
  const stats                    = statsData?.data?.data as CallStats | undefined;
  const campaigns: Campaign[]    = campaignsData?.data?.data || [];
  const publishers: Publisher[]  = publishersData?.data?.data || [];

  const setFilter = (key: string, value: string) => {
    const v = value === 'all' ? '' : value;
    setFilters((p) => (key === 'publisher' ? { ...p, publisher: v, campaign: '' } : { ...p, [key]: v }));
    setPage(1);
  };

  const statCards = [
    { label: 'Total Calls',  value: stats?.totalCalls ?? 0,   icon: PhoneCall,   color: 'text-indigo-600', isText: false },
    { label: 'Valid Calls',  value: stats?.validCalls ?? 0,   icon: Activity,    color: 'text-green-600',  isText: false },
    { label: 'Invalid Calls', value: stats?.invalidCalls ?? 0, icon: PhoneOff,    color: 'text-red-600',    isText: false },
    { label: 'Fraud Rate',   value: stats ? formatPct(stats.fraudRate) : '0.0%', icon: ShieldAlert, color: 'text-amber-600', isText: true },
  ];

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Call Tracking</h1>
          <p className="text-sm text-muted-foreground">
            {meta?.total ?? '—'} total {isFetching && <span className="text-blue-500">· refreshing...</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['calls'] })}>
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <span className="text-3xl font-bold">
                {stat.isText ? stat.value : (stat.value as number).toLocaleString()}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-publisher fraud breakdown */}
      {stats?.perPublisher && stats.perPublisher.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="text-left px-4 py-2 font-semibold">Publisher</th>
                  <th className="text-right px-4 py-2 font-semibold">Calls</th>
                  <th className="text-right px-4 py-2 font-semibold">Invalid</th>
                  <th className="text-right px-4 py-2 font-semibold">Fraud rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.perPublisher.map((p) => (
                  <tr key={p._id || p.publisherName}>
                    <td className="px-4 py-2 truncate">{p.publisherName}</td>
                    <td className="px-4 py-2 text-right">{p.total.toLocaleString()}</td>
                    <td className={`px-4 py-2 text-right ${p.invalid > 0 ? 'text-red-600 font-medium' : ''}`}>{p.invalid.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{formatPct(p.fraudRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Caller ID..." className="pl-8 h-8 text-xs" value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)} />
            </div>

            {isSuperAdmin && (
              <Select value={filters.publisher || 'all'} onValueChange={(v) => setFilter('publisher', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All publishers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All publishers</SelectItem>
                  {publishers.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={filters.campaign || 'all'} onValueChange={(v) => setFilter('campaign', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.status || 'all'} onValueChange={(v) => setFilter('status', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="call_before_lead">Call before lead</SelectItem>
                <SelectItem value="unmatched">Unmatched</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.fraud || 'all'} onValueChange={(v) => setFilter('fraud', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Fraud only</SelectItem>
                <SelectItem value="false">Clean only</SelectItem>
              </SelectContent>
            </Select>

            <Input type="date" className="h-8 text-xs" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            <Input type="date" className="h-8 text-xs" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <PhoneCall className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No calls found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Caller ID</th>
                    <th className="text-left px-4 py-3 font-semibold">Publisher</th>
                    <th className="text-left px-4 py-3 font-semibold">Campaign</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Call received (EST)</th>
                    <th className="text-left px-4 py-3 font-semibold">Form submitted (EST)</th>
                    <th className="text-left px-4 py-3 font-semibold">Difference</th>
                    {isSuperAdmin && <th className="text-left px-4 py-3 font-semibold"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calls.map((call) => {
                    const fraud = call.isFraud;
                    const leadAt = call.matchedLead?.createdAt;
                    const gap = timeGap(call.callTimeStamp, leadAt);
                    return (
                      <tr key={call._id} className={fraud ? 'bg-red-50' : 'hover:bg-slate-50/80'}>
                        <td className="px-4 py-3">
                          <code className={`text-xs font-mono ${fraud ? 'text-red-700 font-semibold' : 'text-slate-700'}`}>
                            {formatUsPhone(call.callerId)}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {call.publisher?.name || call.publisherName || <span className="text-amber-600">unknown</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{call.campaign?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className={getCallStatusBadgeColor(call.status)}>{callStatusLabel(call.status)}</Badge>
                        </td>
                        {/* Exact call-received time */}
                        <td className={`px-4 py-3 text-xs whitespace-nowrap ${fraud ? 'text-red-700 font-medium' : 'text-slate-600'}`}>
                          {formatEstFull(call.callTimeStamp)}
                        </td>
                        {/* Exact lead form-submission time (same page, easy compare) */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">
                          {leadAt ? formatEstFull(leadAt) : <span className="text-slate-400">no lead</span>}
                        </td>
                        {/* Difference between the two */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {gap
                            ? <span className={gap.fraud ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{gap.label}</span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        {isSuperAdmin && (
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete call"
                              onClick={() => { if (confirm('Delete this call record?')) deleteMutation.mutate(call._id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
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
          <p className="text-sm text-muted-foreground">Page {meta.page} of {meta.pages} · {meta.total} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
