import { useQuery } from '@tanstack/react-query';
import { submissionService, campaignService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/index';
import { Badge } from '@/components/ui/index';
import { Loader2, TrendingUp, Phone, Megaphone, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { formatDate, getStatusBadgeColor, getSourceBadgeColor } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['submission-stats'],
    queryFn: () => submissionService.getStats(),
    refetchInterval: 30000,
  });

  const { data: recentSubs, isLoading: subsLoading } = useQuery({
    queryKey: ['recent-submissions'],
    queryFn: () => submissionService.getAll({ limit: 5 }),
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', { limit: 5 }],
    queryFn: () => campaignService.getAll({ limit: 5 }),
    enabled: user?.role !== 'agent',
  });

  type StatBucket = { _id: string; count: number };
  type StatsData = {
    totals: number;
    byStatus?: StatBucket[];
    bySource?: StatBucket[];
  };

  const statsData = stats?.data?.data as StatsData | undefined;
  const submissions = recentSubs?.data?.data || [];
  const campaignList = campaigns?.data?.data || [];

  const statCards = [
    { label: 'Total Submissions', value: statsData?.totals || 0, icon: Phone, color: 'text-blue-600' },
    { label: 'Sent to Ringba', value: (statsData?.byStatus?.find((s) => s._id === 'sent') as any)?.count || 0, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Failed', value: (statsData?.byStatus?.find((s) => s._id === 'failed') as any)?.count || 0, icon: XCircle, color: 'text-red-600' },
    { label: 'Reposts', value: (statsData?.bySource?.find((s) => s._id === 'repost') as any)?.count || 0, icon: RefreshCw, color: 'text-amber-600' },
  ];

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="section-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {user?.name}</p>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading stats...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <span className="text-3xl font-bold">{stat.value.toLocaleString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Submissions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {subsLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : submissions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No submissions yet.</div>
            ) : (
              <div className="divide-y">
                {submissions.map((sub: any) => (
                  <div key={sub._id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{sub.phone || 'No phone'}</p>
                      <p className="text-xs text-muted-foreground truncate">{sub.campaign?.name} · {formatDate(sub.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 ml-3 flex-shrink-0">
                      <Badge className={getSourceBadgeColor(sub.source)}>{sub.source}</Badge>
                      <Badge className={getStatusBadgeColor(sub.status)}>{sub.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Campaigns */}
        {user?.role !== 'agent' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Active Campaigns</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {campaignList.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No campaigns found.</div>
              ) : (
                <div className="divide-y">
                  {campaignList.map((c: any) => (
                    <div key={c._id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">Ringba: {c.ringbaId} · {c.fields?.length || 0} fields</p>
                      </div>
                      <Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}