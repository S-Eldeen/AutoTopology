import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout, { FormErrorBanner, SubmitButton } from '../components/auth/AuthLayout.jsx';
import { authApi } from '../services/endpoints.js';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const token = params.get('token') || '';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try { await authApi.resetPassword(token, password); setDone(true); }
    catch (err) { setError(err.response?.data?.error?.message || 'Could not reset password'); }
    finally { setLoading(false); }
  };

  return (
    <AuthLayout headline="Choose a new password" description="Reset links expire after 15 minutes and can only be used once." features={[]}>
      <div className="rounded-2xl border border-white/[0.08] bg-[#050b0a]/78 p-8">
        <h2 className="mb-5 text-2xl font-bold text-white">New password</h2>
        <FormErrorBanner message={!token ? 'Missing password reset token' : error} />
        {done ? <Link className="btn-primary w-full justify-center" to="/login">Password updated — sign in</Link> : (
          <form onSubmit={submit} className="space-y-5">
            <input className="input rounded-xl" type="password" minLength={8} required disabled={!token} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
            <SubmitButton loading={loading} loadingLabel="Updating…">Update password</SubmitButton>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
