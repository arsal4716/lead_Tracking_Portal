import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, Building2, Megaphone,
  FileText, Layers, Settings, LogOut, ChevronRight,
  Phone, PhoneCall, ClipboardList, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'agent'] },
  { label: 'Submissions', href: '/submissions', icon: ClipboardList, roles: ['super_admin', 'admin', 'agent'] },
  { label: 'Call Tracking', href: '/calls', icon: PhoneCall, roles: ['super_admin', 'admin'] },
  { label: 'Submit Lead', href: '/submit', icon: Phone, roles: ['agent'] },
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone, roles: ['super_admin', 'admin'] },
  { label: 'Field Library', href: '/fields', icon: Layers, roles: ['super_admin'] },
  { label: 'Publishers', href: '/publishers', icon: Building2, roles: ['super_admin'] },
  { label: 'Users', href: '/users', icon: Users, roles: ['super_admin', 'admin'] },
  { label: 'Audit Logs', href: '/audit', icon: FileText, roles: ['super_admin', 'admin'] },
  { label: 'API Config', href: '/api-config', icon: Settings, roles: ['super_admin', 'admin'] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {}
    logout();
    queryClient.clear(); // wipe cached data so the next user starts clean
    navigate('/login');
    toast.success('Logged out.');
  };

  const visibleNav = navItems.filter((item) => item.roles.includes(user?.role || ''));

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r bg-card flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center gap-2 px-6 border-b">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-sm">Lead_Tracking</span>
            <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleNav.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
                {active && <ChevronRight className="ml-auto h-4 w-4" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {user?.name?.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
