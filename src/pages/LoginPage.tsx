import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PodTrackerLogo } from '../components/PodTrackerLogo';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { applyTheme, resolveInitialTheme } from '../lib/theme';

type LoginMode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';

const PASSWORD_MIN_LENGTH = 15;

function getMode(value: string | null): LoginMode {
  if (value === 'sign-up' || value === 'forgot' || value === 'reset') {
    return value;
  }

  return 'sign-in';
}

export default function LoginPage() {
  const { isLoading, signInWithGoogle, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = getMode(searchParams.get('mode'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(resolveInitialTheme());
  }, []);

  const from = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname || '/';
  }, [location.state]);

  if (!isLoading && user && mode !== 'reset') {
    return <Navigate to={from} replace />;
  }

  const setMode = (nextMode: LoginMode, options: { keepMessage?: boolean } = {}) => {
    if (!options.keepMessage) {
      setMessage(null);
    }
    setError(null);
    setPassword('');
    setConfirmPassword('');
    setSearchParams(nextMode === 'sign-in' ? {} : { mode: nextMode });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login?mode=reset`,
        });

        if (resetError) {
          throw resetError;
        }

        setMessage('Password reset email sent. Open the link from this browser to choose a new password.');
        return;
      }

      if (mode === 'reset') {
        if (password.length < PASSWORD_MIN_LENGTH) {
          throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          throw updateError;
        }

        setMessage('Password updated. Taking you back to the tracker.');
        navigate('/', { replace: true });
        return;
      }

      if (password.length < PASSWORD_MIN_LENGTH) {
        throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      }

      if (mode === 'sign-up') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        setMessage('Account created. Check your email if confirmation is enabled, then sign in.');
        setMode('sign-in', { keepMessage: true });
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw signInError;
      }

      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsOAuthSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await signInWithGoogle(window.location.origin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setIsOAuthSubmitting(false);
    }
  };

  const title = {
    'sign-in': 'Sign In',
    'sign-up': 'Create Account',
    forgot: 'Reset Password',
    reset: 'Choose New Password',
  }[mode];
  const showGoogleSignIn = mode === 'sign-in' || mode === 'sign-up';

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-[48rem] flex-col justify-center px-4 py-8'>
      <section className='wireframe-shell auth-shell'>
        <div className='space-y-3 text-left'>
          <PodTrackerLogo className='podtracker-logo-auth' />
          <h1 className='auth-page-title'>{title}</h1>
          <p className='auth-copy'>
            {mode === 'reset'
              ? 'Enter a new password for this browser session.'
              : 'Use your Supabase account to keep the Commander tracker private.'}
          </p>
        </div>

        <form className='auth-form' onSubmit={handleSubmit}>
          {showGoogleSignIn && (
            <div className='auth-oauth-section'>
              <button
                type='button'
                className='auth-google-button'
                disabled={isSubmitting || isOAuthSubmitting}
                onClick={handleGoogleSignIn}
              >
                <span className='auth-google-mark' aria-hidden='true'>
                  G
                </span>
                <span>{isOAuthSubmitting ? 'Opening Google...' : 'Continue with Google'}</span>
              </button>

              <div className='auth-divider'>
                <span>or continue with email</span>
              </div>
            </div>
          )}

          {mode !== 'reset' && (
            <label className='auth-field'>
              <span>Email</span>
              <input
                type='email'
                className='app-input'
                value={email}
                autoComplete='email'
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}

          {mode !== 'forgot' && (
            <label className='auth-field'>
              <span>Password</span>
              <input
                type='password'
                className='app-input'
                value={password}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}

          {mode === 'reset' && (
            <label className='auth-field'>
              <span>Confirm Password</span>
              <input
                type='password'
                className='app-input'
                value={confirmPassword}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete='new-password'
                required
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}

          {message && <p className='auth-message'>{message}</p>}
          {error && <p className='auth-error'>{error}</p>}

          <button type='submit' className='dashboard-save-button auth-submit' disabled={isSubmitting || isOAuthSubmitting}>
            {isSubmitting ? 'Working...' : title}
          </button>
        </form>

        <div className='auth-actions'>
          {mode !== 'sign-in' && (
            <button type='button' onClick={() => setMode('sign-in')}>
              Back to sign in
            </button>
          )}
          {mode !== 'sign-up' && mode !== 'reset' && (
            <button type='button' onClick={() => setMode('sign-up')}>
              Create account
            </button>
          )}
          {mode !== 'forgot' && mode !== 'reset' && (
            <button type='button' onClick={() => setMode('forgot')}>
              Forgot password
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
