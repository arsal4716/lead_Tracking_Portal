import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import DashboardPage from '@/pages/DashboardPage';
import CampaignsPage from '@/pages/CampaignsPage';
import CampaignBuilderPage from '@/pages/CampaignBuilderPage';
import SubmissionsPage from '@/pages/SubmissionsPage';
import CallsPage from '@/pages/CallsPage';
import SubmitLeadPage from '@/pages/SubmitLeadPage';
import FieldLibraryPage from '@/pages/FieldLibraryPage';
import PublishersPage from '@/pages/PublishersPage';
import UsersPage from '@/pages/UsersPage';
import AuditPage from '@/pages/AuditPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* All authenticated users */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
          </Route>

          {/* Agent only */}
          <Route element={<ProtectedRoute roles={['agent']} />}>
            <Route path="/submit" element={<SubmitLeadPage />} />
          </Route>

          {/* Admin + Super Admin */}
          <Route element={<ProtectedRoute roles={['admin', 'super_admin']} />}>
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/new" element={<CampaignBuilderPage />} />
            <Route path="/campaigns/:id/edit" element={<CampaignBuilderPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>

          {/* Super Admin only */}
          <Route element={<ProtectedRoute roles={['super_admin']} />}>
            <Route path="/fields" element={<FieldLibraryPage />} />
            <Route path="/publishers" element={<PublishersPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          style: { fontSize: '14px' },
        }}
      />
    </QueryClientProvider>
  );
}
