import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { useChatStore } from './stores/chatStore.js';

const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const ChatPage = lazy(() => import('./pages/ChatPage.jsx'));
const PlansPage = lazy(() => import('./pages/PlansPage.jsx'));
const SharedChatPage = lazy(() => import('./pages/SharedChatPage.jsx'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage.jsx'));
const SecurityPage = lazy(() => import('./pages/SecurityPage.jsx'));
const OnboardingModal = lazy(() => import('./components/auth/OnboardingModal.jsx'));

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function GuestRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/chat" replace /> : children;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const fetchUsage = useAuthStore((s) => s.fetchUsage);
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
      fetchUsage().catch(() => {});
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
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route
            path="/security"
            element={
              <ProtectedRoute>
                <SecurityPage />
              </ProtectedRoute>
            }
          />
          <Route path="/share/:token" element={<SharedChatPage />} />
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
      </Suspense>
    </>
  );
}
