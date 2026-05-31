import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import LinkVkCallbackPage from '../pages/LinkVkCallbackPage';
import LinkTelegramCallbackPage from '../pages/LinkTelegramCallbackPage';
import AssignmentsPage from '../pages/AssignmentsPage';
import ContactsPage from '../pages/ContactsPage';
import DashboardPage from '../pages/DashboardPage';
import FinancePage from '../pages/FinancePage';
import LoginPage from '../pages/LoginPage';
import MaterialsPage from '../pages/MaterialsPage';
import NotFoundPage from '../pages/NotFoundPage';
import PortfolioPage from '../pages/PortfolioPage';
import RequestsPage from '../pages/RequestsPage';
import SchedulePage from '../pages/SchedulePage';
import StudentsPage from '../pages/StudentsPage';
import TutorProfilePage from '../pages/TutorProfilePage';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/link-vk-callback" element={<LinkVkCallbackPage />} />
        <Route path="/link-telegram-callback" element={<LinkTelegramCallbackPage />} />

        <Route path="/" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/students" element={<ProtectedLayout><StudentsPage /></ProtectedLayout>} />
        <Route path="/contacts" element={<ProtectedLayout><ContactsPage /></ProtectedLayout>} />
        <Route path="/schedule" element={<ProtectedLayout><SchedulePage /></ProtectedLayout>} />
        <Route path="/requests" element={<ProtectedLayout><RequestsPage /></ProtectedLayout>} />
        <Route path="/assignments" element={<ProtectedLayout><AssignmentsPage /></ProtectedLayout>} />
        <Route path="/materials" element={<ProtectedLayout><MaterialsPage /></ProtectedLayout>} />
        <Route path="/finance" element={<ProtectedLayout><FinancePage /></ProtectedLayout>} />
        <Route path="/portfolio" element={<ProtectedLayout><PortfolioPage /></ProtectedLayout>} />
        <Route path="/profile" element={<ProtectedLayout><TutorProfilePage /></ProtectedLayout>} />

        <Route path="*" element={<NotFoundPage />} />
        <Route path="" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
