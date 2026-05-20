import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditService } from '@/services';
import { Card, CardContent } from '@/components/ui/index';
import { Badge } from '@/components/ui/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/index';
import { Loader2, FileText, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-800',
  REGISTER: 'bg-green-100 text-green-800',
  CREATE: 'bg-emerald-100 text-emerald-800',
  UPDATE: 'bg-amber-100 text-amber-800',
  DELETE: 'bg-red-100 text-red-800',
  DEACTIVATE: 'bg-orange-100 text-orange-800',
  ROTATE_API_KEY: 'bg-purple-100 text-purple-800',
  CREATE_USER: 'bg-teal-100 text-teal-800',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', { page, search }],
    queryFn: () => auditService.getAll({ page, limit: 30 }),
    refetchInterval: 30000,
  });

  const logs = data?.data?.data || [];
  const meta = data?.data?.meta;

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? '—'} events · live refresh every 30s</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No audit events yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Resource</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log: any) => (
                    <tr key={log._id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium">{log.user?.name || 'System'}</p>
                        <p className="text-xs text-muted-foreground">{log.user?.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs">{log.resource}</p>
                        {log.resourceId && (
                          <code className="text-xs text-muted-foreground">{String(log.resourceId).slice(-8)}</code>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-muted-foreground">{log.ipAddress || '—'}</code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={log.success ? 'success' : 'destructive'}>
                          {log.success ? 'Success' : 'Failed'}
                        </Badge>
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
    </div>
  );
}
