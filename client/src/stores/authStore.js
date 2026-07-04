/**
 * Auth store — user, tokens, login/logout/refresh.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi, paymentApi, profileApi } from '../services/endpoints.js';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      profile: null,  // GNS3 profile
      // Controls whether the OnboardingModal is force-shown (e.g. when the
      // user clicks "Settings" in the sidebar). When false, the modal only
      // auto-shows if profile.isCalibrated is false.
      showProfileModal: false,

      // Actions
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { user, accessToken, refreshToken } = await authApi.login({ email, password });
          set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false });
          // Fetch profile in background
          get().fetchProfile();
          return true;
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const { user, accessToken, refreshToken } = await authApi.register({ email, password, name });
          set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false });
          return true;
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      refresh: async () => {
        const currentRefresh = get().refreshToken;
        if (!currentRefresh) return false;
        try {
          const { user, accessToken, refreshToken } = await authApi.refresh(currentRefresh);
          set({ user, accessToken, refreshToken, isAuthenticated: true });
          return true;
        } catch {
          get().logoutLocal();
          return false;
        }
      },

      logout: async () => {
        const refreshToken = get().refreshToken;
        try { await authApi.logout(refreshToken); } catch {}
        get().logoutLocal();
      },

      logoutLocal: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, profile: null });
      },

      setUsage: (usage) => {
        if (!usage) return;
        set((state) => ({
          user: state.user ? { ...state.user, plan: usage.plan, usage } : state.user,
        }));
      },

      fetchMe: async () => {
        try {
          const { user } = await authApi.me();
          set({ user, isAuthenticated: true });
          return true;
        } catch {
          get().logoutLocal();
          return false;
        }
      },

      fetchProfile: async () => {
        try {
          const { profile } = await profileApi.get();
          set({ profile });
        } catch { /* ignore */ }
      },

      updateProfile: async (data) => {
        const { profile } = await profileApi.update(data);
        set({ profile });
        return profile;
      },

      fetchUsage: async () => {
        const { usage } = await profileApi.usage();
        get().setUsage(usage);
        return usage;
      },

      updatePlan: async (plan) => {
        if (plan === 'free') {
          const { user, usage } = await profileApi.updatePlan(plan);
          set({ user: { ...user, usage } });
          return { user, usage };
        }

        const result = await paymentApi.checkout(plan);
        if (result.url) {
          window.location.assign(result.url);
          return result;
        }

        const { user, usage } = result;
        set({ user: { ...user, usage } });
        return result;
      },

      confirmPayment: async (sessionId) => {
        const { user, usage } = await paymentApi.confirm(sessionId);
        set({ user: { ...user, usage } });
        return { user, usage };
      },

      // ── Onboarding modal controls ────────────────────────────
      // openProfileModal: force-show the GNS3 calibration popup (used by
      //   the sidebar "Settings" button so users can recalibrate later).
      // closeProfileModal: hide the popup (used by the modal's X / Skip /
      //   Save buttons). Does NOT change isCalibrated — that is set by
      //   the backend on PUT /profile.
      openProfileModal: () => set({ showProfileModal: true }),
      closeProfileModal: () => set({ showProfileModal: false }),
    }),
    {
      name: 'structuranet-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
