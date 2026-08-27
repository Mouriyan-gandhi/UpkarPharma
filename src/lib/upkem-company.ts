// UPKAR PHARMA DISTRIBUTORS — seller info printed on every invoice.
// Kept in one place so both the server invoice HTML and any admin UI reference
// the same values. Update here if any details change.

export const COMPANY = {
  name:    'UPKAR PHARMA DISTRIBUTORS',
  brand:   'UPKEM LABS',
  address: 'NO.47, GROUND FLOOR, 1ST STREET,\nVAIDYNATHA MUDALI STREET, CHENNAI 600079',
  email:   'UPKARPHARMADISTRIBUTORS@GMAIL.COM',
  mobile:  '9840895791',
  gstin:   '33BACPV0654A1Z6',
  dl_no:   'TN-02-20B-00081 / TN-02-21B-00081',
  bank: {
    name:   'KOTAK MAHINDRA BANK',
    branch: 'G.N.STREET',
    ac_no:  '9840895791',
    ifsc:   'KKBK0008497',
  },
  terms: [
    'Subject to CHENNAI Jurisdiction.',
    'Please check Batch No, Qty, Exp before taking delivery.',
    'Goods once sold cannot be returned unless there is a batch failure.',
    'If payment is not received within 60 days, interest will be charged at 24%.',
  ],
} as const;
