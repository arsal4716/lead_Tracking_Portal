import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { campaignService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent } from '@/components/ui/index';
import { Badge } from '@/components/ui/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/index';
import { copyToClipboard, formatDate, providerLabel, providerBadgeColor, campaignProviderKey } from '@/lib/utils';
import {
  Plus, Copy, Check, Search, ExternalLink,
  ToggleLeft, ToggleRight, Loader2, Link2,
  Shield, ShieldCheck, Zap, Pencil, Trash2,
} from 'lucide-react';
import type { Campaign } from '@/types';

export default function CampaignsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', { search, page }],
    queryFn: () => campaignService.getAll({ search, page, limit: 20 }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      campaignService.update(id, { isActive: !isActive } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign updated.');
    },
    onError: () => toast.error('Failed to update campaign.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed.'),
  });

  const campaigns: Campaign[] = data?.data?.data || [];
  const meta = data?.data?.meta;
  const isSuperAdmin = user?.role === 'super_admin';
  const canManage = isSuperAdmin || user?.role === 'admin';

  // Production domain only — NEVER an internal IP. Prefer the backend-provided
  // enrichUrl (already built on PUBLIC_BASE_URL); fall back to the prod domain.
  const PUBLIC_BASE = 'https://hlgleadtrack.com';

  const normalizeBase = (url: string) => url.replace(/\/$/, '');

  const buildEnrichUrl = (campaign: Campaign): string => {
    const publisherId =
      typeof campaign.publisher === 'object'
        ? (campaign.publisher as any)._id
        : campaign.publisher;

    const base = campaign.enrichUrl
      ? normalizeBase(campaign.enrichUrl)
      : `${PUBLIC_BASE}/api/v1/public/enrich/${publisherId}/${campaign._id}`;

    if (!campaign.fields?.length) return base;

    const params = new URLSearchParams();

    campaign.fields
      .filter((cf: any) => cf.includeInRingba !== false)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((cf: any) => {
        const field = cf.field;
        if (!field) return;

        if (['jornaya_leadid', 'token_trustedform', 'trusted_id'].includes(field.type)) return;

        const key = field.ringbaParamKey || field.key;
        params.append(key, `{${field.key}}`);
      });

    return params.toString() ? `${base}?${params.toString()}` : base;
  };

  const handleCopy = async (campaign: Campaign) => {
    const url = buildEnrichUrl(campaign);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(campaign._id);
      toast.success('Enrich URL copied!');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast.error('Copy failed.');
    }
  };

  const handleDelete = (campaign: Campaign) => {
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(campaign._id);
  };

  return (
    <div className="page-container space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {meta?.total ?? '—'} campaigns · {campaigns.filter((c) => c.isActive).length} active
          </p>
        </div>
        {canManage && (
          <Button onClick={() => navigate('/campaigns/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search campaigns..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Zap className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No campaigns found.</p>
              {canManage && (
                <Link to="/campaigns/new" className="text-sm text-primary hover:underline mt-1">
                  Create your first campaign →
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Campaign</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Publisher</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider Key</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fields</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Validation</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Enrich URL</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campaigns.map((campaign) => (
                    <tr key={campaign._id} className="hover:bg-muted/30 transition-colors">

                      <td className="px-4 py-3">
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(campaign.createdAt)}</p>
                      </td>

                      <td className="px-4 py-3 text-sm">
                        {campaign.publisher && typeof campaign.publisher === 'object'
                          ? <span className="font-medium text-slate-700">{campaign.publisher.name}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className="px-4 py-3">
                        <Badge className={providerBadgeColor(campaign.destination)}>{providerLabel(campaign.destination)}</Badge>
                      </td>

                      <td className="px-4 py-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{campaignProviderKey(campaign)}</code>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {campaign.fields?.length || 0}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {campaign.jornayaEnabled
                            ? <span title="Jornaya enabled"><ShieldCheck className="h-4 w-4 text-green-500" /></span>
                            : <span title="Jornaya disabled"><Shield className="h-4 w-4 text-muted-foreground/30" /></span>
                          }
                          {campaign.trustedFormEnabled
                            ? <span title="TrustedForm enabled"><ShieldCheck className="h-4 w-4 text-blue-500" /></span>
                            : <span title="TrustedForm disabled"><Shield className="h-4 w-4 text-muted-foreground/30" /></span>
                          }
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {canManage ? (
                          <button
                            onClick={() => toggleMutation.mutate({ id: campaign._id, isActive: campaign.isActive })}
                            disabled={toggleMutation.isPending}
                            className="flex items-center gap-1.5 text-sm disabled:opacity-50"
                          >
                            {campaign.isActive ? (
                              <><ToggleRight className="h-5 w-5 text-green-500" /><span className="text-green-600 font-medium">Active</span></>
                            ) : (
                              <><ToggleLeft className="h-5 w-5 text-muted-foreground" /><span className="text-muted-foreground">Inactive</span></>
                            )}
                          </button>
                        ) : (
                          <Badge variant={campaign.isActive ? 'success' : 'secondary'}>
                            {campaign.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleCopy(campaign)}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-input hover:bg-accent transition-colors font-medium whitespace-nowrap"
                        >
                          {copiedId === campaign._id ? (
                            <><Check className="h-3.5 w-3.5 text-green-500" /><span className="text-green-600">Copied!</span></>
                          ) : (
                            <><Copy className="h-3.5 w-3.5" /><span>Copy URL</span></>
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => navigate(`/campaigns/${campaign._id}/edit`)}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                          )}
                          {isSuperAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(campaign)}
                              disabled={deleteMutation.isPending}
                              title="Delete campaign"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => navigate(`/campaigns/${campaign._id}`)}
                            title="View details"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrich URL info */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">


            <Link2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">Enrich URL includes all campaign fields</p>
              <code className="text-xs text-blue-700 mt-1 block break-all">
                …/enrich/&#123;publisherId&#125;/&#123;campaignId&#125;?phone=&#123;phone&#125;&amp;first_name=&#123;first_name&#125;&amp;…
              </code>
              <p className="text-xs text-blue-600 mt-1">
                Copy URL generates a template with <code className="bg-blue-100 px-0.5 rounded">&#123;field_key&#125;</code> placeholders — replace them with real values in your integration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.pages} · {meta.total} total
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}