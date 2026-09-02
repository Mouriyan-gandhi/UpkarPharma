// Dynamic Expo config. Extends app.json and injects environment-specific settings.
//
// Preview/Production build:
//   API_BASE_URL=https://your-app.vercel.app \
//   npx eas build --platform android --profile preview

const base = require('./app.json').expo;

module.exports = () => {
  const isProduction = process.env.APP_ENV === 'production';
  const apiBaseUrl = process.env.API_BASE_URL || '';

  if (isProduction && !apiBaseUrl) {
    console.error('[app.config] ERROR: API_BASE_URL must be set for production builds.');
    process.exit(1);
  }

  return {
    ...base,
    extra: {
      ...base.extra,
      apiBaseUrl,
      isProduction,
      // Catalog mode: 'derma' (default) locks the customer catalog to
      // category=Derma and hides Category+Company filter sections. Set
      // CATALOG_MODE=all to restore the multi-category browsing UI.
      catalogMode: process.env.CATALOG_MODE || 'derma',
    },
    // Merge plugins: preserve anything app.json (or `expo install`) added
    // (e.g. expo-updates), then add our own two. Avoids the classic
    // dynamic-config footgun where returning `plugins: [...]` silently
    // wipes plugins the CLI wrote to app.json.
    plugins: [
      ...(base.plugins || []),
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: !isProduction,
          },
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#0B2618',
          sounds: [],
        },
      ],
    ],
  };
};
