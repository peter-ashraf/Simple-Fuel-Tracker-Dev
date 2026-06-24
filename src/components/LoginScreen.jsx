import { useState } from 'react';
import { motion } from 'framer-motion';
import { authService } from '../services/authService';
import { GasPump, Envelope, Lock, User, UserPlus, SignIn, Eye, EyeSlash } from '@phosphor-icons/react';

const MotionDiv = motion.div;

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetMessage, setResetMessage] = useState('');

  const handleForgotPassword = async () => {
    setError('');
    setResetMessage('');
    if (!identifier.trim()) {
      setError('Enter your username or email first.');
      return;
    }

    setLoading(true);
    try {
      await authService.sendPasswordReset(identifier);
      setResetMessage('Password reset instructions were sent to your email.');
    } catch (err) {
      setError(err.message || 'Could not send password reset instructions.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await authService.signIn(identifier, password, rememberMe);
      } else {
        await authService.signUp(username, email, password);
      }

      // Initialize sync after successful auth
      setSyncing(true);
      const { cloudSyncService } = await import('../services/cloudSyncService');
      await cloudSyncService.initialize();
      setSyncing(false);

      // Reload to trigger auth check in App
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-black p-5">
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-3xl mb-4">
            <GasPump weight="duotone" className="text-emerald-500 dark:text-emerald-400 w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Fuel Tracker Dev
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {isLogin ? 'Local dev mode is available without cloud sync' : 'Create a dev account to get started'}
          </p>
        </div>

        {/* Syncing Indicator */}
        {syncing && (
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-200 dark:border-blue-500/20"
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                Syncing your data...
              </p>
            </div>
          </MotionDiv>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {isLogin ? 'Username or email' : 'Email'}
            </label>
            <div className="relative">
              {isLogin ? (
                <User weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              ) : (
                <Envelope weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              )}
              <input
                type={isLogin ? 'text' : 'email'}
                value={isLogin ? identifier : email}
                onChange={(e) => isLogin ? setIdentifier(e.target.value) : setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                placeholder={isLogin ? 'username or email' : 'your@email.com'}
                required
                disabled={loading || syncing}
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Username
              </label>
              <div className="relative">
                <User weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                  placeholder="username"
                  required
                  disabled={loading || syncing}
                  minLength={3}
                  maxLength={24}
                  pattern="[A-Za-z0-9_]+"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                placeholder="••••••••"
                required
                disabled={loading || syncing}
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading || syncing}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showPassword ? <EyeSlash weight="duotone" className="w-5 h-5" /> : <Eye weight="duotone" className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember me checkbox - only show for login */}
          {isLogin && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading || syncing}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-500/50 bg-white dark:bg-slate-900"
                />
                <label
                  htmlFor="remember-me"
                  className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Remember me
                </label>
              </div>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading || syncing}
                className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
          )}

          {resetMessage && (
            <MotionDiv
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/20"
            >
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{resetMessage}</p>
            </MotionDiv>
          )}

          {error && (
            <MotionDiv
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/20"
            >
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
            </MotionDiv>
          )}

          <button
            type="submit"
            disabled={loading || syncing}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isLogin ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              <>
                {isLogin ? <SignIn weight="duotone" className="w-5 h-5" /> : <UserPlus weight="duotone" className="w-5 h-5" />}
                {isLogin ? 'Sign In' : 'Create Account'}
              </>
            )}
          </button>
        </form>

        {/* Toggle */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setPassword('');
            }}
            disabled={loading || syncing}
            className="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition disabled:opacity-50"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        {/* Privacy Note */}
        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          Your data is encrypted and stored securely. You can delete your account at any time.
        </p>
      </MotionDiv>
    </div>
  );
}
