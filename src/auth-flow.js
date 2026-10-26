// Email flow state is scoped to this browser tab. Passwords and tokens are never stored here.
const KEY = 'health-email-flow-v1';
const MAX_AGE = 24 * 60 * 60 * 1000;

export function emailRateLimit(error) {
  const message = String(error?.message || '');
  const seconds = message.match(/(?:after|in)\s+(\d+)\s*seconds?/i);
  if (seconds) return Math.min(3600, Math.max(1, Number(seconds[1])));
  if (error?.code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) return 3600;
  if (error?.status === 429 || error?.code === 'over_request_rate_limit') return 60;
  return 0;
}

export function createEmailFlow(auth, storage, now = Date.now) {
  let pending = null;
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null');
    if (saved && ['signup', 'recovery'].includes(saved.type) && typeof saved.email === 'string' && Number.isFinite(saved.createdAt) && Number.isFinite(saved.retryAt) && now() - saved.createdAt < MAX_AGE && saved.createdAt <= now()) pending = saved;
  } catch { /* Storage may be unavailable in private browsing. */ }
  function save(value) {
    pending = value;
    try { value ? storage?.setItem(KEY, JSON.stringify(value)) : storage?.removeItem(KEY); } catch { /* In-memory state remains usable. */ }
    return value;
  }
  function waitSeconds(email, type) {
    if (!pending || pending.email !== email.trim().toLowerCase() || pending.type !== type) return 0;
    return Math.max(0, Math.ceil((pending.retryAt - now()) / 1000));
  }
  function record(email, type, seconds, delivery) {
    return save({ email: email.trim().toLowerCase(), type, retryAt: now() + seconds * 1000, createdAt: now(), delivery });
  }
  let sending = false;
  async function send({ email, type = 'signup', signup, origin }) {
    email = email.trim().toLowerCase();
    const remaining = waitSeconds(email, type);
    if (sending || remaining) return { pending, limited: true, remaining };
    sending = true;
    try {
      let result;
      if (signup) result = await auth.signUp({ email, password: signup.password, options: { data: { name: signup.name.trim() }, emailRedirectTo: origin + '/' } });
      else if (type === 'recovery') result = await auth.resetPasswordForEmail(email, { redirectTo: origin + '/?reset=1' });
      else result = await auth.resend({ type: 'signup', email, options: { emailRedirectTo: origin + '/' } });
      if (result.error) {
        const seconds = emailRateLimit(result.error);
        // A rate-limited signUp creates no account, so there is nothing to verify or resend yet.
        if (seconds && signup) { const error = new Error(`Too many sign-up emails were requested. Please wait ${seconds >= 60 ? Math.ceil(seconds / 60) + ' minutes' : seconds + ' seconds'} and try again.`); error.code = 'signup_rate_limited'; throw error; }
        if (seconds) return { pending: record(email, type, seconds, 'unconfirmed'), limited: true, remaining: seconds };
        throw result.error;
      }
      if (result.data?.session) { save(null); return { session: result.data.session }; }
      return { pending: record(email, type, 60, 'requested'), limited: false, remaining: 60 };
    } finally { sending = false; }
  }
  return { get: () => pending, clear: () => save(null), waitSeconds, send, remember: (email, type = 'signup') => pending?.email === email.trim().toLowerCase() && pending.type === type ? pending : record(email, type, 0, 'unconfirmed') };
}

export function authMessage(error) {
  if (error?.code === 'invalid_credentials') return 'Email or password is incorrect. Use the password you chose when creating this account.';
  if (error?.code === 'email_address_not_authorized') return 'Email delivery is not enabled for this address yet. Public registration needs the app’s email service to be configured.';
  if (error?.code === 'email_not_confirmed') return 'Confirm your email before signing in.';
  return error?.message || 'Something went wrong. Please try again.';
}
