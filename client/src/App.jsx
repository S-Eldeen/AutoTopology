import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { useChatStore } from './stores/chatStore.js';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import PlansPage from './pages/PlansPage.jsx';
import OnboardingModal from './components/auth/OnboardingModal.jsx';

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const profile = useAuthStore((s) => s.profile);
  const showProfileModal = useAuthStore((s) => s.showProfileModal);

  // On mount: if we have a token but no user, fetch /me
  useEffect(() => {
    if (accessToken && !isAuthenticated) {
      fetchMe().then((ok) => {
        if (ok) fetchProfile();
      });
    } else if (isAuthenticated) {
      fetchProfile();
      loadSessions();
    }
  }, []); // eslint-disable-line

  // Show the onboarding modal when:
  //  (a) the user explicitly opened it via Sidebar "Settings" (showProfileModal),
  //      OR
  //  (b) it's the user's first sign-in and they haven't calibrated yet
  //      (!profile.isCalibrated). Once they save or skip, isCalibrated
  //      becomes true and the popup won't auto-reappear.
  const shouldShowOnboarding = isAuthenticated && (
    showProfileModal || (profile && !profile.isCalibrated)
  );

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <ProtectedRoute>
              <PlansPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {shouldShowOnboarding && <OnboardingModal />}
    </>
  );
}
