import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';
const LOGIN_FORM = { email: '', password: '' };
const SIGNUP_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  passwordConfirm: '',
  agreeToTerms: true,
};

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [mode, setMode] = useState('login');
  const [session, setSession] = useState(null);
  const [burnoutSnapshot, setBurnoutSnapshot] = useState({
    burnoutRisk: 24,
    level: 'Low',
    status: 'Healthy equilibrium',
    latestEmotion: 'neutral',
  });
  const [moodHistory, setMoodHistory] = useState([]);
  const [note, setNote] = useState('');
  const [loginForm, setLoginForm] = useState(LOGIN_FORM);
  const [signupForm, setSignupForm] = useState(SIGNUP_FORM);
  const [banner, setBanner] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.authToken || !session?.user?.id) return;
    void refreshDashboard(session);
  }, [session?.authToken, session?.user?.id]);

  const greeting = useMemo(
    () => session?.user?.firstName || session?.user?.name || 'there',
    [session]
  );

  async function requestJson(path, options = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(session?.authToken ? { Authorization: `Bearer ${session.authToken}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Request failed with ${response.status}`);
    }
    return data;
  }

  async function refreshDashboard(activeSession = session) {
    const userId = activeSession?.user?.id;
    if (!userId) return;

    const [history, snapshot] = await Promise.all([
      requestJson(`/mood/history?userId=${encodeURIComponent(userId)}`),
      requestJson(`/mood/burnout-risk?userId=${encodeURIComponent(userId)}`),
    ]);
    setMoodHistory(Array.isArray(history) ? history : []);
    setBurnoutSnapshot((prev) => ({ ...prev, ...snapshot }));
  }

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setBanner(null);
  };

  const handleLogin = async () => {
    setIsSubmitting(true);
    setBanner(null);
    try {
      const nextSession = await requestJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      setSession(nextSession);
      setBanner({ type: 'success', text: 'Signed in successfully.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async () => {
    setIsSubmitting(true);
    setBanner(null);
    try {
      const response = await requestJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify(signupForm),
      });
      setBanner({
        type: 'success',
        text: response.verificationUrl
          ? `Account created. Verify with the emailed link or local debug link: ${response.verificationUrl}`
          : response.message || 'Account created. Check your email to verify it.',
      });
      setMode('login');
      setLoginForm((prev) => ({ ...prev, email: signupForm.email }));
      setSignupForm(SIGNUP_FORM);
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickCheckIn = async (presetText) => {
    const text = presetText || note.trim();
    if (!text) return;

    setIsSubmitting(true);
    setBanner(null);
    try {
      await requestJson('/interactions/text', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setNote('');
      await refreshDashboard();
      setBanner({ type: 'success', text: 'Check-in saved.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!session) {
    const isLogin = mode === 'login';

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authShell} keyboardShouldPersistTaps="handled">
          <View style={styles.authCard}>
            {/* Green banner, matching the web sign-in card. */}
            <View style={styles.authHeader}>
              <Text style={styles.authHeaderBrand}>MINDGUARD</Text>
              <Text style={styles.authHeaderTitle}>
                {isLogin ? 'Login to your account' : 'Sign up'}
              </Text>
              <Text style={styles.authHeaderSubtitle}>
                {isLogin
                  ? 'Welcome back, please log in using your details below'
                  : 'Everything you share stays confidential. Your check-ins travel over an encrypted connection and are only ever visible to your own account.'}
              </Text>
            </View>

            <View style={styles.authBody}>
              {banner && (
                <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
                  <Text
                    style={[
                      styles.bannerText,
                      banner.type === 'error' ? styles.bannerTextError : styles.bannerTextSuccess,
                    ]}
                  >
                    {banner.text}
                  </Text>
                </View>
              )}

              {isLogin ? (
                <>
                  <LabelledInput
                    label="Email"
                    value={loginForm.email}
                    onChangeText={(value) => setLoginForm((prev) => ({ ...prev, email: value }))}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                  />
                  <LabelledInput
                    label="Password"
                    value={loginForm.password}
                    onChangeText={(value) => setLoginForm((prev) => ({ ...prev, password: value }))}
                    secureTextEntry
                    textContentType="password"
                  />

                  <Pressable
                    style={[styles.primaryButton, styles.centeredButton, isSubmitting && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.primaryButtonText}>{isSubmitting ? 'Signing in...' : 'Log In'}</Text>
                  </Pressable>

                  <Text style={styles.switchCopy}>
                    New user?{' '}
                    <Text style={styles.switchLink} onPress={() => switchMode('signup')}>
                      Sign up now
                    </Text>
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.row}>
                    <LabelledInput
                      label="First Name"
                      style={styles.halfInput}
                      value={signupForm.firstName}
                      onChangeText={(value) => setSignupForm((prev) => ({ ...prev, firstName: value }))}
                    />
                    <LabelledInput
                      label="Last Name"
                      style={styles.halfInput}
                      value={signupForm.lastName}
                      onChangeText={(value) => setSignupForm((prev) => ({ ...prev, lastName: value }))}
                    />
                  </View>

                  <View style={styles.infoNote}>
                    <Text style={styles.infoNoteText}>
                      This account needs to be in the name of whoever is receiving support.
                    </Text>
                  </View>

                  <LabelledInput
                    label="Email"
                    value={signupForm.email}
                    onChangeText={(value) => setSignupForm((prev) => ({ ...prev, email: value }))}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                  />

                  <View style={styles.row}>
                    <LabelledInput
                      label="Password"
                      style={styles.halfInput}
                      value={signupForm.password}
                      onChangeText={(value) => setSignupForm((prev) => ({ ...prev, password: value }))}
                      secureTextEntry
                    />
                    <LabelledInput
                      label="Repeat Password"
                      style={styles.halfInput}
                      value={signupForm.passwordConfirm}
                      onChangeText={(value) => setSignupForm((prev) => ({ ...prev, passwordConfirm: value }))}
                      secureTextEntry
                    />
                  </View>

                  <Pressable
                    style={styles.termsRow}
                    onPress={() => setSignupForm((prev) => ({ ...prev, agreeToTerms: !prev.agreeToTerms }))}
                  >
                    <View style={[styles.checkbox, signupForm.agreeToTerms && styles.checkboxChecked]}>
                      {signupForm.agreeToTerms && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                    <Text style={styles.termsText}>
                      I agree to the Terms of Service and understand that MindGuard supports wellness
                      check-ins and is not a substitute for emergency care.
                    </Text>
                  </Pressable>

                  <View style={styles.signupActions}>
                    <Text style={styles.switchCopy}>
                      Already have an account?{' '}
                      <Text style={styles.switchLink} onPress={() => switchMode('login')}>
                        Log in now
                      </Text>
                    </Text>
                    <Pressable
                      style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
                      onPress={handleSignup}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.primaryButtonText}>{isSubmitting ? 'Creating...' : 'Continue'}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.dangerNote}>
                    <Text style={styles.dangerNoteTitle}>
                      ⚠ If you are in a life threatening situation — don&apos;t use this site
                    </Text>
                    <Text style={styles.dangerNoteText}>
                      Call or text 988 (Suicide &amp; Crisis Lifeline) for immediate support, or call 911
                      / go to your nearest emergency room if you are in immediate danger.
                    </Text>
                    <Text style={styles.dangerNoteText}>
                      For treatment referrals, SAMHSA&apos;s National Helpline is 1-800-662-HELP (4357),
                      free and available 24/7.
                    </Text>
                  </View>
                </>
              )}

              <View style={styles.apiBlock}>
                <Text style={styles.label}>API URL</Text>
                <TextInput
                  style={styles.input}
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.dashboardShell}>
        <View style={styles.dashboardHeader}>
          <View>
            <Text style={styles.brand}>MindGuard Companion</Text>
            <Text style={styles.subtitle}>Welcome back, {greeting}.</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => setSession(null)}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Current burnout score</Text>
          <Text style={styles.statValue}>{burnoutSnapshot.burnoutRisk}%</Text>
          <Text style={styles.statMeta}>{burnoutSnapshot.status}</Text>
        </View>

        {banner && (
          <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
            <Text style={[styles.bannerText, banner.type === 'error' ? styles.bannerTextError : styles.bannerTextSuccess]}>{banner.text}</Text>
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Quick check-in</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Type what feels most important right now..."
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={styles.quickActions}>
            {[
              'My deadlines feel unrealistic today',
              'I am exhausted and need a short reset',
              'I want to log a calm moment before it disappears',
            ].map((item) => (
              <Pressable key={item} style={styles.chip} onPress={() => handleQuickCheckIn(item)}>
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={() => handleQuickCheckIn()} disabled={isSubmitting}>
            <Text style={styles.primaryButtonText}>{isSubmitting ? 'Saving...' : 'Save Check-In'}</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent emotions</Text>
          {moodHistory.length ? (
            moodHistory.slice(0, 5).map((entry) => (
              <View key={entry.id || entry.timestamp} style={styles.historyRow}>
                <Text style={styles.historyEmotion}>{formatLabel(entry.emotion)}</Text>
                <Text style={styles.historyMeta}>{new Date(entry.timestamp).toLocaleString()}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Your first authenticated check-in will show up here.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Label + input pair, so mobile fields carry the same affordance as the web form. */
function LabelledInput({ label, style, ...inputProps }) {
  return (
    <View style={[styles.fieldBlock, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9bb3b9" {...inputProps} />
    </View>
  );
}

function formatLabel(value) {
  return (value || 'neutral')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4fbfa',
  },
  authShell: {
    padding: 16,
    justifyContent: 'center',
    minHeight: '100%',
  },
  dashboardShell: {
    padding: 20,
    gap: 16,
  },
  authCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0f766e',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  authHeader: {
    backgroundColor: '#0f766e',
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  authHeaderBrand: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  authHeaderTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  authHeaderSubtitle: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  authBody: {
    padding: 22,
    gap: 16,
  },
  fieldBlock: {
    gap: 7,
  },
  centeredButton: {
    alignSelf: 'center',
    minWidth: 180,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  switchCopy: {
    color: '#55727a',
    fontSize: 14,
    textAlign: 'center',
  },
  switchLink: {
    color: '#0f766e',
    fontWeight: '800',
  },
  signupActions: {
    gap: 14,
  },
  infoNote: {
    borderLeftWidth: 4,
    borderLeftColor: '#0f9f8f',
    backgroundColor: 'rgba(20, 184, 166, 0.08)',
    borderRadius: 12,
    padding: 14,
  },
  infoNoteText: {
    color: '#17353d',
    fontSize: 14,
    lineHeight: 21,
  },
  dangerNote: {
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.3)',
    backgroundColor: '#fff5f5',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  dangerNoteTitle: {
    color: '#7f1d1d',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 20,
  },
  dangerNoteText: {
    color: '#7f1d1d',
    fontSize: 13,
    lineHeight: 19,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#bfe6df',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#17353d',
  },
  subtitle: {
    fontSize: 15,
    color: '#55727a',
    marginTop: 6,
  },
  apiBlock: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#55727a',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cae9e4',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#17353d',
  },
  multilineInput: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfe6df',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '700',
  },
  banner: {
    borderRadius: 16,
    padding: 12,
  },
  bannerSuccess: {
    backgroundColor: '#effbf8',
    borderWidth: 1,
    borderColor: '#b6e8df',
  },
  bannerError: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#f1c2c2',
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 19,
  },
  bannerTextSuccess: {
    color: '#0b766c',
  },
  bannerTextError: {
    color: '#991b1b',
  },
  statCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d4efea',
  },
  statLabel: {
    color: '#55727a',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 42,
    fontWeight: '800',
    color: '#17353d',
    marginTop: 8,
  },
  statMeta: {
    color: '#0f766e',
    marginTop: 6,
    fontWeight: '700',
  },
  panel: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d4efea',
    gap: 14,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#17353d',
  },
  quickActions: {
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#f1fbf8',
    borderWidth: 1,
    borderColor: '#d5eeea',
  },
  chipText: {
    color: '#0f766e',
    fontWeight: '600',
  },
  historyRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#edf6f4',
  },
  historyEmotion: {
    color: '#17353d',
    fontWeight: '700',
  },
  historyMeta: {
    color: '#7f9aa1',
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: '#7f9aa1',
  },
});
