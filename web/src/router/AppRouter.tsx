import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import DashboardPage from '../pages/DashboardPage';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import StudentsPage from '../pages/StudentsPage';
import SchedulePage from '../pages/SchedulePage';
import AssignmentsPage from '../pages/AssignmentsPage';
import SubjectsPage from '../pages/SubjectsPage';

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

        <Route path="/" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/students" element={<ProtectedLayout><StudentsPage /></ProtectedLayout>} />
        <Route path="/schedule" element={<ProtectedLayout><SchedulePage /></ProtectedLayout>} />
        <Route path="/assignments" element={<ProtectedLayout><AssignmentsPage /></ProtectedLayout>} />
        <Route path="/subjects" element={<ProtectedLayout><SubjectsPage /></ProtectedLayout>} />

        <Route path="*" element={<NotFoundPage />} />
        <Route path="" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}