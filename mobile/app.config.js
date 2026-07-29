// Dynamic Expo config. Extends app.json and injects environment-specific settings.
//
// Production build:
//   APP_ENV=production \
//   API_BASE_URL=https://your-app.railway.app \
//   FIREBASE_API_KEY=AIza... \
//   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com \
//   FIREBASE_PROJECT_ID=your-project-id \
//   eas build --profile production

const base = require('./app.json').expo;

module.exports = () => {
  const isProduction = process.env.APP_ENV === 'production';
  const apiBaseUrl = process.env.API_BASE_URL || '';

  if (isProduction && !apiBaseUrl) {
    console.error('[app.config] ERROR: API_BASE_URL must be set for production builds.');
    process.exit(1);
  }
  if (isProduction && !process.env.FIREBASE_API_KEY) {
    console.error('[app.config] ERROR: FIREBASE_API_KEY must be set for production builds.');
    process.exit(1);
  }

  return {
    ...base,
    extra: {
      ...base.extra,
      apiBaseUrl,
      isProduction,
      firebaseApiKey: process.env.FIREBASE_API_KEY || '',
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
    },
    plugins: [
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
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
