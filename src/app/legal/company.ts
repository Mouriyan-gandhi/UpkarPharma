// Single source of truth for legal/company details shown on the public legal
// pages. Update these to match the registered business before publishing.
// NOTE: values marked TODO should be confirmed with the client / lawyer.

export const COMPANY = {
  legalName: 'UPKAR PHARMA DISTRIBUTORS',
  brand: 'UPKEM LABS',
  appName: 'UPKEM LABS',
  address: 'No.47, Ground Floor, 1st Street, Vaidyanatha Mudali Street, Chennai 600079, Tamil Nadu, India',
  email: 'upkarpharmadistributors@gmail.com',
  phone: '+91 98408 95791',
  gstin: '33BACPV0654A1Z6',
  drugLicense: 'TN-02-20B-00081 / TN-02-21B-00081',
  // Public URL where the app and store listings are hosted. Update after the
  // domain is purchased (e.g. https://app.upkarpharma.com).
  websiteUrl: 'https://YOUR-DOMAIN', // TODO: set production domain
  // Jurisdiction for the Terms governing-law clause.
  jurisdiction: 'Chennai, Tamil Nadu, India',
};

// Keep this current whenever a legal page is materially changed.
export const LAST_UPDATED = '4 June 2026';
