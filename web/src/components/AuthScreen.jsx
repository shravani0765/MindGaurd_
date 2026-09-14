import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/api';
import { Button, Callout, CheckboxField, Field, FieldRow, StatusBanner } from './ui';
import CrisisResources from './CrisisResources';
import { detectCrisisRegion } from '../services/crisisResources';

const LOGIN_FORM = { email: '', password: '' };
const SIGNUP_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  passwordConfirm: '',
  agreeToTerms: false,
};
const FORGOT_FORM = { email: '' };
const RESET_FORM = { password: '', passwordConfirm: '' };

const MIN_PASSWORD_LENGTH = 8;

const HEADERS = {
  login: {
    title: 'Login to your account',
    subtitle: 'Welcome back, please log in using your details below',
  },
  signup: {
    title: 'Sign up',
    subtitle:
      'Everything you share stays confidential. Your check-ins travel over an encrypted connection and are only ever visible to your own account.',
  },
  forgot: {
    title: 'Reset your password',
    subtitle: 'Enter your email and we will send a secure reset link if the account exists.',
  },
  reset: {
    title: 'Create a new password',
    subtitle: 'Use a password you have not used before and keep it private.',
  },
};

export default function AuthScreen({
  onAuthenticated,
  initialMode = 'login',
  routePath = '/',
  routeToken = '',
}) {
  const [mode, setMode] = useState(routePath === '/reset-password' ? 'reset' : initialMode);
  const [loginForm, setLoginForm] = useState(LOGIN_FORM);
  const [signupForm, setSignupForm] = useState(SIGNUP_FORM);
  const [forgotForm, setForgotForm] = useState(FORGOT_FORM);
  const [resetForm, setResetForm] = useState(RESET_FORM);
  const [banner, setBanner] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // No onboarding choice exists yet at signup, so guess from the browser.
  const [crisisRegion] = useState(detectCrisisRegion);

  useEffect(() => {
    async function runVerification() {
      if (routePath !== '/verify-email' || !routeToken) return;

      setIsSubmitting(true);
      try {
        const response = await apiClient.verifyEmail(routeToken);
        setBanner({ tone: 'success', text: response.message || 'Email verified. You can log in now.' });
        window.history.replaceState({}, '', '/');
      } catch (error) {
        setBanner({ tone: 'error', text: error.message || 'Verification link is invalid or expired.' });
      } finally {
        setMode('login');
        setIsSubmitting(false);
      }
    }

    void runVerification();
  }, [routePath, routeToken]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setBanner(null);
    setFieldErrors({});
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setBanner(null);
    try {
      const session = await apiClient.login(loginForm);
      onAuthenticated(session);
    } catch (error) {
      setBanner({ tone: 'error', text: error.message || 'Unable to sign in right now.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();

    // Validate locally first so the user is not charged a round-trip for a typo.
    const errors = validateSignup(signupForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setBanner({ tone: 'error', text: 'Please correct the highlighted fields before continuing.' });
      return;
    }

    setIsSubmitting(true);
    setBanner(null);
    try {
      const response = await apiClient.register(signupForm);
      setBanner({
        tone: 'success',
        text: response.verificationUrl
          ? `Account created. Open the verification link from your email, or use this local debug link: ${response.verificationUrl}`
          : response.message || 'Account created. Check your email to verify it.',
      });
      setMode('login');
      setLoginForm((prev) => ({ ...prev, email: signupForm.email }));
      setSignupForm(SIGNUP_FORM);
      setFieldErrors({});
    } catch (error) {
      setBanner({ tone: 'error', text: error.message || 'Unable to create your account.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgot = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setBanner(null);
    try {
      const response = await apiClient.requestPasswordReset(forgotForm.email);
      setBanner({
        tone: 'success',
        text: response.resetUrl
          ? `Reset link generated for local testing: ${response.resetUrl}`
          : response.message || 'If that email exists, a reset link has been sent.',
      });
      setForgotForm(FORGOT_FORM);
    } catch (error) {
      setBanner({ tone: 'error', text: error.message || 'Unable to start password reset.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();

    const errors = validatePasswordPair(resetForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSubmitting(true);
    setBanner(null);
    try {
      const response = await apiClient.confirmPasswordReset(
        routeToken,
        resetForm.password,
        resetForm.passwordConfirm
      );
      setBanner({ tone: 'success', text: response.message || 'Password updated. You can log in now.' });
      setResetForm(RESET_FORM);
      setMode('login');
      window.history.replaceState({}, '', '/');
    } catch (error) {
      setBanner({ tone: 'error', text: error.message || 'Unable to reset password.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const header = HEADERS[mode];

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card__header">
          <span className="auth-card__brand">
            <ShieldCheck size={15} aria-hidden="true" />
            MindGuard
          </span>
          <h1>{header.title}</h1>
          <p>{header.subtitle}</p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-card__body" noValidate>
            {banner && <StatusBanner tone={banner.tone}>{banner.text}</StatusBanner>}

            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />

            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />

            <div className="auth-actions auth-actions--center">
              <Button type="submit" size="lg" isLoading={isSubmitting} loadingLabel="Signing in...">
                Log In
              </Button>
              <Button variant="link" onClick={() => switchMode('forgot')}>
                Forgot password?
              </Button>
            </div>

            <p className="auth-switch">
              New user?{' '}
              <Button variant="link" onClick={() => switchMode('signup')}>
                Sign up now
              </Button>
            </p>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="auth-card__body" noValidate>
            {banner && <StatusBanner tone={banner.tone}>{banner.text}</StatusBanner>}

            <FieldRow>
              <Field
                label="First Name"
                autoComplete="given-name"
                value={signupForm.firstName}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, firstName: event.target.value }))}
                error={fieldErrors.firstName}
                required
              />
              <Field
                label="Last Name"
                autoComplete="family-name"
                value={signupForm.lastName}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, lastName: event.target.value }))}
                error={fieldErrors.lastName}
                required
              />
            </FieldRow>

            <Callout tone="info">
              This account needs to be in the name of whoever is receiving support.
            </Callout>

            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={signupForm.email}
              onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
              error={fieldErrors.email}
              required
            />

            <FieldRow>
              <Field
                label="Password"
                type="password"
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                value={signupForm.password}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
                error={fieldErrors.password}
                required
              />
              <Field
                label="Repeat Password"
                type="password"
                autoComplete="new-password"
                value={signupForm.passwordConfirm}
                onChange={(event) =>
                  setSignupForm((prev) => ({ ...prev, passwordConfirm: event.target.value }))
                }
                error={fieldErrors.passwordConfirm}
                required
              />
            </FieldRow>

            <CheckboxField
              checked={signupForm.agreeToTerms}
              onChange={(event) => setSignupForm((prev) => ({ ...prev, agreeToTerms: event.target.checked }))}
              label={
                <>
                  I agree to the Terms of Service and understand that MindGuard supports wellness
                  check-ins and is not a substitute for emergency care or clinical treatment.
                </>
              }
            />
            {fieldErrors.agreeToTerms && (
              <p className="auth-inline-error">{fieldErrors.agreeToTerms}</p>
            )}

            <div className="auth-actions auth-actions--split">
              <p className="auth-switch">
                Already have an account?{' '}
                <Button variant="link" onClick={() => switchMode('login')}>
                  Log in now
                </Button>
              </p>
              <Button type="submit" size="lg" isLoading={isSubmitting} loadingLabel="Creating...">
                Continue
              </Button>
            </div>

            <CrisisResources regionId={crisisRegion} />
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-card__body" noValidate>
            {banner && <StatusBanner tone={banner.tone}>{banner.text}</StatusBanner>}

            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={forgotForm.email}
              onChange={(event) => setForgotForm({ email: event.target.value })}
              required
            />

            <div className="auth-actions auth-actions--center">
              <Button type="submit" size="lg" isLoading={isSubmitting} loadingLabel="Sending...">
                Send reset link
              </Button>
            </div>

            <p className="auth-switch">
              Remembered it?{' '}
              <Button variant="link" onClick={() => switchMode('login')}>
                Back to log in
              </Button>
            </p>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="auth-card__body" noValidate>
            {banner && <StatusBanner tone={banner.tone}>{banner.text}</StatusBanner>}

            {!routeToken && (
              <StatusBanner tone="error">
                This reset link is missing its token. Request a new link from the login screen.
              </StatusBanner>
            )}

            <FieldRow>
              <Field
                label="Password"
                type="password"
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                value={resetForm.password}
                onChange={(event) => setResetForm((prev) => ({ ...prev, password: event.target.value }))}
                error={fieldErrors.password}
                required
              />
              <Field
                label="Repeat Password"
                type="password"
                autoComplete="new-password"
                value={resetForm.passwordConfirm}
                onChange={(event) =>
                  setResetForm((prev) => ({ ...prev, passwordConfirm: event.target.value }))
                }
                error={fieldErrors.passwordConfirm}
                required
              />
            </FieldRow>

            <div className="auth-actions auth-actions--center">
              <Button
                type="submit"
                size="lg"
                isLoading={isSubmitting}
                loadingLabel="Updating..."
                disabled={!routeToken}
              >
                Update password
              </Button>
            </div>

            <p className="auth-switch">
              Want to sign in instead?{' '}
              <Button variant="link" onClick={() => switchMode('login')}>
                Back to log in
              </Button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function validateSignup(form) {
  const errors = validatePasswordPair(form);

  if (!form.firstName.trim()) errors.firstName = 'Required';
  if (!form.lastName.trim()) errors.lastName = 'Required';
  if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address';
  if (!form.agreeToTerms) errors.agreeToTerms = 'Please agree to the Terms of Service to continue.';

  return errors;
}

function validatePasswordPair({ password, passwordConfirm }) {
  const errors = {};

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password !== passwordConfirm) {
    errors.passwordConfirm = 'Passwords do not match';
  }

  return errors;
}
