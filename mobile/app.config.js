// Dynamic Expo config. Extends app.json and injects environment-specific
// settings so production builds are store-compliant (HTTPS only, no cleartext).
//
// Build with:
//   APP_ENV=production API_BASE_URL=https://api.yourdomain.com eas build --profile production
//   (dev/preview default to cleartext + the LAN IP fallback in App.tsx)

const base = require('./app.json').expo;

module.exports = () => {
  const isProduction = process.env.APP_ENV === 'production';

  // The HTTPS API base for built apps. MUST be set for production builds.
  const apiBaseUrl = process.env.API_BASE_URL || (isProduction ? 'https://api.YOUR-DOMAIN' : null);

  return {
    ...base,
    extra: {
      ...base.extra,
      apiBaseUrl,
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            // Cleartext HTTP is permitted only for local dev/preview builds.
            // Production is HTTPS-only — required by Google Play & Apple ATS.
            usesCleartextTraffic: !isProduction,
          },
        },
      ],
    ],
  };
};
