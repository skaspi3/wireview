import * as Sentry from '@sentry/vue';

// Replace with your actual Sentry DSN after creating a project at https://sentry.io
const SENTRY_DSN = '';

const CONSENT_KEY = 'sentry-consent';

export const getSentryConsent = () => localStorage.getItem(CONSENT_KEY);

export const setSentryConsent = (value) => {
  localStorage.setItem(CONSENT_KEY, value);
};

export const initSentry = (app) => {
  if (!SENTRY_DSN) return;
  if (getSentryConsent() !== 'yes') return;

  Sentry.init({
    app,
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0,
  });
};

export const enableSentry = (app) => {
  setSentryConsent('yes');
  initSentry(app);
};

export const disableSentry = () => {
  setSentryConsent('no');
};
