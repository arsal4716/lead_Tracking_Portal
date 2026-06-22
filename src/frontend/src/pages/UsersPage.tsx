import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { userService, publisherService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input, Label, Card, CardContent } from '@/components/ui/index';
import { Badge } from '@/components/ui/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import { Plus, Search, Loader2, Users, X, ToggleLeft, ToggleRight, UserCheck, UserX, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { User } from '@/types';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-800',
  admin: 'bg-blue-100 text-blue-800',
  agent: 'bg-green-100 text-green-800',
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const { data, isLoading } = useQuery({
    queryKey: ['users', { search, roleFilter, approvalFilter, page }],
    queryFn: () => userService.getAll({
      search,
      role: roleFilter || undefined,
      approvalStatus: approvalFilter || undefined,
      page, limit: 20,
    }),
  });

  const { data: publishersData } = useQuery({
    queryKey: ['publishers-all'],
    queryFn: () => publisherService.getAll({ limit: 100 }),
    enabled: currentUser?.role === 'super_admin',
  });

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<{
    name: string; email: string; password: string; role: string; publisher?: string;
  }>();

  const saveMutation = useMutation({
    mutationFn: (d: any) => {
      if (editingUser) {
        const payload = { ...d };
        if (!payload.password) delete payload.password; // keep existing password
        return userService.update(editingUser._id, payload);
      }
      return userService.create(d);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(editingUser ? 'User updated.' : 'User created.');
      closeModal();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Save failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => userService.toggleActive(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(res.data.data.isActive ? 'User activated.' : 'User deactivated.');
    },
    onError: () => toast.error('Failed to toggle user.'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      action === 'approve' ? userService.approve(id) : userService.reject(id),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(vars.action === 'approve' ? 'User approved.' : 'User rejected.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Action failed.'),
  });

  const users: User[] = data?.data?.data || [];
  const meta = data?.data?.meta;
  const publishers = publishersData?.data?.data || [];
  const watchedRole = watch('role');

  const openModal = (u?: User) => {
    setEditingUser(u || null);
    reset(u
      ? { name: u.name, email: u.email, password: '', role: u.role, publisher: typeof u.publisher === 'object' ? u.publisher?._id : (u.publisher as any) }
      : { name: '', email: '', password: '', role: '', publisher: '' });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditingUser(null); reset(); };

  const availableRoles = currentUser?.role === 'super_admin'
    ? ['super_admin', 'admin', 'agent']
    : ['admin', 'agent'];

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Users</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? '—'} users</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="h-4 w-4 mr-2" /> New User
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." className="pl-9" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
          </SelectContent>
        </Select>
        {isSuperAdmin && (
          <Select value={approvalFilter || 'all'} onValueChange={(v) => { setApprovalFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All approvals" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All approvals</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No users found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Publisher</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Login</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Approval</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || ''}`}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {typeof u.publisher === 'object' ? u.publisher?.name || '—' : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.lastLogin ? formatDate(u.lastLogin) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleMutation.mutate(u._id)}
                          disabled={u._id === currentUser?._id}
                          className="flex items-center gap-1.5"
                        >
                          {u.isActive
                            ? <><ToggleRight className="h-5 w-5 text-green-500" /><span className="text-xs text-green-600">Active</span></>
                            : <><ToggleLeft className="h-5 w-5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Inactive</span></>
                          }
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const status = u.approvalStatus || 'approved';
                          const color = status === 'pending' ? 'warning' : status === 'rejected' ? 'destructive' : 'success';
                          return <Badge variant={color as any} className="text-xs capitalize">{status}</Badge>;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isSuperAdmin && u.approvalStatus === 'pending' && (
                            <>
                              <Button size="sm" className="h-7 px-2 text-xs"
                                loading={approveMutation.isPending && approveMutation.variables?.id === u._id && approveMutation.variables?.action === 'approve'}
                                onClick={() => approveMutation.mutate({ id: u._id, action: 'approve' })}>
                                <UserCheck className="h-3.5 w-3.5 mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                loading={approveMutation.isPending && approveMutation.variables?.id === u._id && approveMutation.variables?.action === 'reject'}
                                onClick={() => approveMutation.mutate({ id: u._id, action: 'reject' })}>
                                <UserX className="h-3.5 w-3.5 mr-1" />Reject
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openModal(u)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                          </Button>
                          {isSuperAdmin && u._id !== currentUser?._id && (
                            <Button variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete user"
                              onClick={() => { if (confirm(`Delete user "${u.name}" permanently?`)) deleteMutation.mutate(u._id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {meta.page} of {meta.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{editingUser ? 'Edit User' : 'New User'}</h2>
                <button onClick={closeModal}><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input placeholder="John Smith" {...register('name', { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" placeholder="john@example.com" {...register('email', { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label>Password {editingUser ? '' : '*'}</Label>
                  <Input type="password"
                    placeholder={editingUser ? 'Leave blank to keep current' : 'Min 8 characters'}
                    {...register('password', { required: !editingUser, minLength: 8 })} />
                </div>
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Controller
                    name="role"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue placeholder="Select role..." /></SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((r) => (
                            <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                {(watchedRole === 'admin' || watchedRole === 'agent') && currentUser?.role === 'super_admin' && (
                  <div className="space-y-2">
                    <Label>Publisher *</Label>
                    <Controller
                      name="publisher"
                      control={control}
                      rules={{ required: true }}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger><SelectValue placeholder="Select publisher..." /></SelectTrigger>
                          <SelectContent>
                            {publishers.map((p: any) => (
                              <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" className="flex-1" loading={saveMutation.isPending}>{editingUser ? 'Update User' : 'Create User'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
