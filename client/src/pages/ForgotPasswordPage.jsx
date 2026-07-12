import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout, { FormErrorBanner, SubmitButton } from '../components/auth/AuthLayout.jsx';
import { authApi } from '../services/endpoints.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try { setResult(await authApi.forgotPassword(email)); }
    catch (err) { setError(err.response?.data?.error?.message || 'Could not request a password reset'); }
    finally { setLoading(false); }
  };

  return (
    <AuthLayout headline="Reset your password" description="Enter your account email to create a secure, one-time reset link." features={[]}>
      <div className="rounded-2xl border border-white/[0.08] bg-[#050b0a]/78 p-8">
        <h2 className="mb-5 text-2xl font-bold text-white">Forgot password?</h2>
        <FormErrorBanner message={error} />
        {result ? (
          <div className="space-y-4 text-sm text-zinc-300">
            <p>{result.message}</p>
            {result.resetUrl && <Link className="btn-primary w-full justify-center" to={new URL(result.resetUrl).pathname + new URL(result.resetUrl).search}>Continue to reset password</Link>}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <input className="input rounded-xl" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
            <SubmitButton loading={loading} loadingLabel="Creating link…">Reset password</SubmitButton>
          </form>
        )}
        <Link to="/login" className="mt-5 block text-center text-sm text-emerald-400">Back to sign in</Link>
      </div>
    </AuthLayout>
  );
}
