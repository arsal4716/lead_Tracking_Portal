import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { publisherService } from '@/services';
import { Button } from '@/components/ui/button';
import { Input, Label, Card, CardContent } from '@/components/ui/index';
import { Badge } from '@/components/ui/index';
import {
  Plus, Search, RefreshCw, Loader2, Building2, X,
  Copy, Check, Eye, EyeOff, Ban, Power, Trash2,
} from 'lucide-react';
import { formatDate, copyToClipboard } from '@/lib/utils';
import type { Publisher } from '@/types';

export default function PublishersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [ipInput, setIpInput] = useState('');
  const [ipPublisher, setIpPublisher] = useState<Publisher | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['publishers', { search, page }],
    queryFn: () => publisherService.getAll({ search, page, limit: 20 }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    name: string; slug: string; contactEmail: string; contactPhone?: string; notes?: string;
  }>();

  const saveMutation = useMutation({
    mutationFn: (d: any) =>
      editingPublisher ? publisherService.update(editingPublisher._id, d) : publisherService.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publishers'] });
      toast.success(editingPublisher ? 'Publisher updated.' : 'Publisher created.');
      closeModal();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Save failed.'),
  });

  const rotateKeyMutation = useMutation({
    mutationFn: (id: string) => publisherService.rotateApiKey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['publishers'] }); toast.success('API key rotated.'); },
    onError: () => toast.error('Failed to rotate key.'),
  });

  const ipMutation = useMutation({
    mutationFn: ({ id, ips }: { id: string; ips: string[] }) => publisherService.updateIpWhitelist(id, ips),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['publishers'] }); toast.success('IP whitelist updated.'); setIpPublisher(null); },
    onError: () => toast.error('Failed to update whitelist.'),
  });

  // Revoke / restore access — paused publishers (and all their agents) can't log in.
  const toggleMutation = useMutation({
    mutationFn: (id: string) => publisherService.toggleActive(id),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['publishers'] });
      toast.success(res.data.data.isActive ? 'Publisher access restored.' : 'Publisher access revoked.');
    },
    onError: () => toast.error('Failed to update access.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => publisherService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['publishers'] }); toast.success('Publisher deleted.'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed.'),
  });

  const publishers: Publisher[] = data?.data?.data || [];
  const meta = data?.data?.meta;

  const openModal = (p?: Publisher) => {
    setEditingPublisher(p || null);
    reset(p ? { name: p.name, slug: p.slug, contactEmail: p.contactEmail, contactPhone: p.contactPhone, notes: p.notes } : {});
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditingPublisher(null); reset(); };

  const handleCopyKey = async (publisher: Publisher) => {
    const ok = await copyToClipboard(publisher.apiKey);
    if (ok) { setCopiedKey(publisher._id); toast.success('API key copied.'); setTimeout(() => setCopiedKey(null), 2000); }
  };

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Publishers</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? '—'} publishers</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="h-4 w-4 mr-2" /> New Publisher
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search publishers..." className="pl-9" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : publishers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Building2 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No publishers yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Publisher</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">API Key</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP Whitelist</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {publishers.map((p) => (
                    <tr key={p._id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">/{p.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.contactEmail}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {showApiKey[p._id] ? p.apiKey : p.apiKey.slice(0, 6) + '••••••' + p.apiKey.slice(-4)}
                          </code>
                          <button onClick={() => setShowApiKey((s) => ({ ...s, [p._id]: !s[p._id] }))}>
                            {showApiKey[p._id] ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                          <button onClick={() => handleCopyKey(p)}>
                            {copiedKey === p._id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => { setIpPublisher(p); setIpInput(p.ipWhitelist?.join('\n') || ''); }}
                        >
                          {p.ipWhitelist?.length > 0 ? `${p.ipWhitelist.length} IP(s)` : 'Configure'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openModal(p)}>Edit</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => {
                              if (confirm('Rotate API key? The current key will stop working immediately.')) {
                                rotateKeyMutation.mutate(p._id);
                              }
                            }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" /> Rotate Key
                          </Button>
                          {/* Revoke / restore login access for the publisher + its agents */}
                          <Button
                            variant="ghost" size="sm"
                            className={`text-xs h-7 ${p.isActive ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                            onClick={() => {
                              const msg = p.isActive
                                ? `Revoke access for "${p.name}"? They and all their agents will be unable to log in.`
                                : `Restore access for "${p.name}"?`;
                              if (confirm(msg)) toggleMutation.mutate(p._id);
                            }}
                          >
                            {p.isActive ? <><Ban className="h-3 w-3 mr-1" />Revoke</> : <><Power className="h-3 w-3 mr-1" />Restore</>}
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete publisher"
                            onClick={() => { if (confirm(`Delete publisher "${p.name}" permanently? This cannot be undone.`)) deleteMutation.mutate(p._id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {meta.page} of {meta.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{editingPublisher ? 'Edit Publisher' : 'New Publisher'}</h2>
                <button onClick={closeModal}><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input placeholder="Apex Calls" {...register('name', { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label>Slug *</Label>
                  <Input placeholder="apex-calls" {...register('slug', { required: true })} disabled={Boolean(editingPublisher)} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email *</Label>
                  <Input type="email" placeholder="admin@apexcalls.com" {...register('contactEmail', { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input type="tel" placeholder="+1 (555) 000-0000" {...register('contactPhone')} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input placeholder="Internal notes..." {...register('notes')} />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
                    {editingPublisher ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IP Whitelist Modal */}
      {ipPublisher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">IP Whitelist — {ipPublisher.name}</h2>
                <button onClick={() => setIpPublisher(null)}><X className="h-4 w-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">One IP per line. Leave empty to allow all IPs.</p>
              <textarea
                className="w-full h-32 text-sm font-mono border rounded-md p-2 resize-none bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder={'192.168.1.1\n10.0.0.0'}
              />
              <div className="flex gap-3 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setIpPublisher(null)}>Cancel</Button>
                <Button
                  className="flex-1"
                  loading={ipMutation.isPending}
                  onClick={() => ipMutation.mutate({
                    id: ipPublisher._id,
                    ips: ipInput.split('\n').map((ip) => ip.trim()).filter(Boolean),
                  })}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
