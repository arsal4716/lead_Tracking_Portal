import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { submissionService, campaignService, callService, publisherService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/index';
import { Badge, Input } from '@/components/ui/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import { Loader2, Phone, CheckCircle, XCircle, PhoneCall, ShieldAlert } from 'lucide-react';
import { formatDate, todayStr, formatPct } from '@/lib/utils';
import type { SubmissionStats, CallStats, Campaign, Publisher } from '@/types';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  const isAgent      = user?.role === 'agent';

  // Dashboard defaults to TODAY only.
  const [filters, setFilters] = useState({
    from:      todayStr(),
    to:        todayStr(),
    publisher: '',
    campaign:  '',
  });

  const params = {
    from:      filters.from || undefined,
    to:        filters.to || undefined,
    publisher: filters.publisher || undefined,
    campaign:  filters.campaign || undefined,
  };

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['submission-stats', filters],
    queryFn: () => submissionService.getStats(params),
    refetchInterval: 30000,
  });

  const { data: callStats } = useQuery({
    queryKey: ['call-stats', filters],
    queryFn: () => callService.getStats(params),
    refetchInterval: 30000,
    enabled: !isAgent,
  });

  const { data: recentSubs, isLoading: subsLoading } = useQuery({
    queryKey: ['recent-submissions', filters],
    queryFn: () => submissionService.getAll({ ...params, limit: 8 }),
  });

  const { data: campaigns } = useQuery({
    queryKey: ['dash-campaigns', filters.publisher],
    queryFn: () => campaignService.getAll({ limit: 100, publisher: filters.publisher || undefined }),
    enabled: !isAgent,
  });

  const { data: publishersData } = useQuery({
    queryKey: ['dash-publishers'],
    queryFn: () => publisherService.getAll({ limit: 100 }),
    enabled: isSuperAdmin,
  });

  const s          = stats?.data?.data as SubmissionStats | undefined;
  const cs         = callStats?.data?.data as CallStats | undefined;
  const submissions = recentSubs?.data?.data || [];
  const campaignList: Campaign[] = campaigns?.data?.data || [];
  const publishers: Publisher[]  = publishersData?.data?.data || [];

  const setFilter = (key: string, value: string) => {
    const v = value === 'all' ? '' : value;
    setFilters((p) => (key === 'publisher' ? { ...p, publisher: v, campaign: '' } : { ...p, [key]: v }));
  };

  const statCards = [
    { label: 'Total Leads',  value: s?.totals ?? 0,       icon: Phone,      color: 'text-blue-600' },
    { label: 'Valid Leads',  value: s?.validLeads ?? 0,   icon: CheckCircle, color: 'text-green-600' },
    { label: 'Invalid (Call→Lead)', value: s?.invalidLeads ?? 0, icon: XCircle, color: 'text-red-600' },
    { label: 'Total Calls',  value: cs?.totalCalls ?? 0,  icon: PhoneCall,  color: 'text-indigo-600' },
    { label: 'Fraud Rate',   value: cs ? formatPct(cs.fraudRate) : '0.0%', icon: ShieldAlert, color: 'text-amber-600', isText: true },
  ];

  return (
    <div className="page-container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {user?.name}</p>
        </div>

        {/* Filters — default to today */}
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-8 w-[9rem] text-xs" value={filters.from}
            onChange={(e) => setFilter('from', e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-[9rem] text-xs" value={filters.to}
            onChange={(e) => setFilter('to', e.target.value)} />

          {isSuperAdmin && (
            <Select value={filters.publisher || 'all'} onValueChange={(v) => setFilter('publisher', v)}>
              <SelectTrigger className="h-8 w-[10rem] text-xs"><SelectValue placeholder="All publishers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All publishers</SelectItem>
                {publishers.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {!isAgent && (
            <Select value={filters.campaign || 'all'} onValueChange={(v) => setFilter('campaign', v)}>
              <SelectTrigger className="h-8 w-[10rem] text-xs"><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaignList.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading stats...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Submissions */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Recent Submissions</CardTitle></CardHeader>
          <CardContent className="p-0">
            {subsLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : submissions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No submissions in this range.</div>
            ) : (
              <div className="divide-y">
                {submissions.map((sub: any) => (
                  <div key={sub._id}
                    className={`flex items-center justify-between px-6 py-3 transition-colors ${sub.callBeforeLead ? 'bg-red-50 hover:bg-red-100/60' : 'hover:bg-muted/40'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{sub.phone || 'No phone'}</p>
                      <p className="text-xs text-muted-foreground truncate">{sub.campaign?.name} · {formatDate(sub.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 ml-3 flex-shrink-0">
                      {sub.callBeforeLead && <Badge variant="destructive">FRAUD</Badge>}
                      <Badge variant={sub.status === 'sent' ? 'success' : sub.status === 'failed' ? 'destructive' : 'secondary'}>{sub.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-publisher breakdown */}
        {!isAgent && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Per-publisher breakdown</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!s?.perPublisher || s.perPublisher.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No data in this range.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                        <th className="text-left px-4 py-2 font-semibold">Publisher</th>
                        <th className="text-right px-4 py-2 font-semibold">Leads</th>
                        <th className="text-right px-4 py-2 font-semibold">Valid</th>
                        <th className="text-right px-4 py-2 font-semibold">Invalid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.perPublisher.map((p) => (
                        <tr key={p._id || p.publisherName}>
                          <td className="px-4 py-2 truncate">{p.publisherName}</td>
                          <td className="px-4 py-2 text-right">{p.total.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-green-600">{p.valid.toLocaleString()}</td>
                          <td className={`px-4 py-2 text-right ${p.invalid > 0 ? 'text-red-600 font-medium' : ''}`}>{p.invalid.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
