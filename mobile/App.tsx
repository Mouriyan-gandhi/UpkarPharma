// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { enableScreens } from 'react-native-screens';
enableScreens(false);
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, 
  FlatList, Image, Modal, KeyboardAvoidingView, Platform, ScrollView,
  LayoutAnimation, UIManager, Animated, Easing, Keyboard, StatusBar,
  Dimensions, RefreshControl, ActivityIndicator
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { create } from 'zustand';
import Constants from 'expo-constants';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Notification Handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEFAULT_IP = '192.168.1.100';
// HTTPS API base injected at build time via app.config.js (extra.apiBaseUrl).
// When present (production/preview builds) it overrides the dev IP entirely.
// Guard for string only — the public manifest may serialize an unset value as {}.
const _rawApiBase = Constants.expoConfig?.extra?.apiBaseUrl;
const API_BASE_URL: string | null =
  typeof _rawApiBase === 'string' && _rawApiBase.length > 0 ? _rawApiBase : null;
const MIN_ORDER_VALUE = 2500;

// UPKEM / UPKAR PHARMA company details for invoice
const COMPANY = {
  name: 'UPKAR PHARMA DISTRIBUTORS',
  brand: 'UPKEM LABS',
  address: 'NO.47, GROUND FLOOR, 1ST STREET,\nVAIDYNATHA MUDALI STREET, CHENNAI 600079',
  email: 'UPKARPHARMONISTRIBUTORS@GMAIL.COM',
  mobile: '9840895791',
  gstin: '33BACPV0654A1Z6',
  dl_no: 'TN-02-20B-00081 / TN-02-21B-00081',
  bank: {
    name: 'KOTAK MAHINDRA BANK',
    branch: 'G.N.STREET',
    ac_no: '9840895791',
    ifsc: 'KKBK0008497',
  },
};

const APP_VERSION = '1.0.0';

// Premium Shadow System
// UPKEM Brand Colors
const BRAND = {
  900: '#0B2618',
  800: '#1B4332',
  700: '#2D6A4F',
  600: '#40916C',
  500: '#52B788',
  100: '#D8F3DC',
  50: '#F0FFF4',
};

const SHADOWS = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 12 },
  glowGreen: { shadowColor: '#1B4332', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  glowEmerald: { shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  glowRed: { shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 }
};

// Premium Button Component
const AnimatedPressable = ({ onPress, style, children, disabled }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 20, bounciness: 5 }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

// Product image mapping by category
const CATEGORY_IMAGES: Record<string, string> = {
  'Analgesics':       'https://images.unsplash.com/photo-1550572017-edd951b55104?w=300&h=300&fit=crop',
  'Antibiotics':      'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=300&h=300&fit=crop',
  'Devices':          'https://images.unsplash.com/photo-1584467735815-f778f274e296?w=300&h=300&fit=crop',
  'Diabetic Care':    'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=300&h=300&fit=crop',
  'Allergy':          'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300&h=300&fit=crop',
  'Gastrointestinal': 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=300&h=300&fit=crop',
  'Vitamins':         'https://images.unsplash.com/photo-1559059699-085698eba48c?w=300&h=300&fit=crop',
  'First Aid':        'https://images.unsplash.com/photo-1583912267550-d6c2ac3196c0?w=300&h=300&fit=crop',
  'Ointments':        'https://images.unsplash.com/photo-1576602975754-7423a4f3e7e0?w=300&h=300&fit=crop',
  'Syrups':           'https://images.unsplash.com/photo-1631549919535-0b2b75c63a90?w=300&h=300&fit=crop',
  'General':          'https://images.unsplash.com/photo-1576602975754-7423a4f3e7e0?w=300&h=300&fit=crop',
};
const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=300&h=300&fit=crop';
const getProductImage = (product: any) => CATEGORY_IMAGES[product.category] || DEFAULT_PRODUCT_IMAGE;
const getTimeOfDay = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; };

// --- Number to Words (Indian system) ---
const numberToWords = (num: number): string => {
  if (num === 0) return 'ZERO';
  const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN',
    'ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const tens = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)] + ' HUNDRED' + (n%100 ? ' ' + convert(n%100) : '');
    if (n < 100000) return convert(Math.floor(n/1000)) + ' THOUSAND' + (n%1000 ? ' ' + convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000)) + ' LAKH' + (n%100000 ? ' ' + convert(n%100000) : '');
    return convert(Math.floor(n/10000000)) + ' CRORE' + (n%10000000 ? ' ' + convert(n%10000000) : '');
  };
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = convert(rupees) + ' RUPEES';
  if (paise > 0) result += ' AND ' + convert(paise) + ' PAISE';
  return result + ' ONLY';
};

// --- Professional GST Invoice Generator (matches UPKAR format) ---
const generateInvoiceHTML = (order: any, user: any) => {
  const invoiceNo = order.id?.replace('UPK-', 'UPD') || 'UPD' + Math.floor(1000 + Math.random() * 9000);
  const invoiceDate = order.date || new Date().toLocaleDateString('en-GB');
  const dueDate = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toLocaleDateString('en-GB'); })();
  
  const subtotal = order.subtotal || order.items?.reduce((a, i) => a + (i.price || 0) * (i.quantity || 0), 0) || 0;
  const discount = order.discount_value || 0;
  const taxableValue = subtotal - discount;
  const gstAmount = order.gst || Math.round(taxableValue * 0.12 * 100) / 100;
  const cgst = Math.round(gstAmount / 2 * 100) / 100;
  const sgst = Math.round(gstAmount / 2 * 100) / 100;
  const netAmount = Math.round(order.total || (taxableValue + gstAmount));
  const roundOff = Math.round((netAmount - (taxableValue + gstAmount)) * 100) / 100;

  const itemRows = (order.items || []).map((item, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td><strong>${item.name}</strong></td>
      <td style="text-align:center;">${item.packing || '1×10'}</td>
      <td style="text-align:center;">${item.company || '-'}</td>
      <td style="text-align:center;">${item.hsn || '30049099'}</td>
      <td style="text-align:center;">${item.batch || '-'}</td>
      <td style="text-align:center;">${item.expiry || '-'}</td>
      <td style="text-align:center;">${item.quantity}</td>
      <td style="text-align:center;">${item.free || 0}</td>
      <td style="text-align:right;">₹${(item.mrp || Math.round((item.price_ptr || item.price) * 1.2)).toFixed(2)}</td>
      <td style="text-align:right;">₹${(item.price_ptr || item.price).toFixed(2)}</td>
      <td style="text-align:center;">${item.discount || 0}%</td>
      <td style="text-align:center;">5%</td>
      <td style="text-align:right;">₹${((item.price || 0) * (item.quantity || 0)).toFixed(2)}</td>
    </tr>
  `).join('');

  const totalQty = (order.items || []).reduce((a, i) => a + (i.quantity || 0), 0);

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 16px; }
      .invoice-border { border: 2px solid #1a1a1a; }
      .header-row { display: flex; border-bottom: 2px solid #1a1a1a; }
      .company-section { flex: 2; padding: 12px; border-right: 2px solid #1a1a1a; }
      .company-name { font-size: 18px; font-weight: 900; text-align: center; margin-bottom: 4px; letter-spacing: 1px; }
      .company-addr { font-size: 10px; text-align: center; line-height: 1.5; color: #333; }
      .company-gst { font-size: 10px; margin-top: 4px; text-align: center; font-weight: 700; }
      .bank-section { flex: 1; padding: 8px; font-size: 10px; }
      .bank-title { font-weight: 900; font-size: 11px; text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 4px; }
      .bank-row { display: flex; justify-content: space-between; padding: 1px 0; }
      .bank-label { font-weight: 700; color: #555; }
      
      .buyer-row { display: flex; border-bottom: 2px solid #1a1a1a; }
      .buyer-section { flex: 1; padding: 8px; border-right: 2px solid #1a1a1a; font-size: 10px; line-height: 1.6; }
      .buyer-section:last-child { border-right: none; }
      .invoice-title { text-align: center; font-size: 14px; font-weight: 900; padding: 6px; background: #f0fff4; border-bottom: 1px solid #1a1a1a; letter-spacing: 2px; }
      .meta-label { font-weight: 700; color: #555; display: inline-block; min-width: 80px; }
      .meta-value { font-weight: 700; color: #1a1a1a; }
      
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0fff4; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 4px; border: 1px solid #1a1a1a; color: #1B4332; }
      td { padding: 5px 4px; border: 1px solid #ddd; font-size: 10px; }
      tr:nth-child(even) { background: #fafffe; }
      
      .summary-row { display: flex; border-top: 2px solid #1a1a1a; }
      .gst-table { flex: 1; border-right: 2px solid #1a1a1a; }
      .gst-table table { font-size: 9px; }
      .gst-table th, .gst-table td { padding: 3px 6px; border: 1px solid #ccc; }
      .amount-summary { flex: 1; padding: 4px 8px; }
      .amount-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; }
      .amount-label { color: #555; }
      .amount-value { font-weight: 700; text-align: right; }
      .net-amount { font-size: 16px; font-weight: 900; color: #1B4332; border-top: 2px solid #1a1a1a; padding-top: 6px; margin-top: 4px; display: flex; justify-content: space-between; }
      
      .words-row { padding: 6px 8px; border-top: 1px solid #1a1a1a; font-size: 10px; font-weight: 600; background: #f8fffe; }
      .footer { padding: 8px; border-top: 2px solid #1a1a1a; display: flex; justify-content: space-between; font-size: 9px; }
      .terms { color: #666; line-height: 1.5; }
      .signature { text-align: right; font-weight: 800; }
      .totals-bar { display: flex; justify-content: space-between; padding: 6px 8px; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; font-size: 10px; font-weight: 700; background: #f0fff4; }
    </style>
  </head>
  <body>
    <div class="invoice-border">
      <!-- HEADER -->
      <div class="header-row">
        <div class="company-section">
          <div class="company-name">${COMPANY.name}</div>
          <div class="company-addr">
            ${COMPANY.address.replace(/\n/g, '<br/>')}
            <br/>Mail: ${COMPANY.email}
            <br/>Mobile: ${COMPANY.mobile}
          </div>
          <div class="company-gst">GST No: ${COMPANY.gstin} &nbsp;&nbsp; DL NO: ${COMPANY.dl_no}</div>
        </div>
        <div class="bank-section">
          <div class="bank-title">BANK DETAILS</div>
          <div class="bank-row"><span class="bank-label">Bank</span> <span>: ${COMPANY.bank.name}</span></div>
          <div class="bank-row"><span class="bank-label">Branch</span> <span>: ${COMPANY.bank.branch}</span></div>
          <div class="bank-row"><span class="bank-label">A/C NO</span> <span>: ${COMPANY.bank.ac_no}</span></div>
          <div class="bank-row"><span class="bank-label">IFSC</span> <span>: ${COMPANY.bank.ifsc}</span></div>
          <div style="text-align:center; margin-top:6px; font-weight:700; font-size:9px;">Q/R CODE</div>
        </div>
      </div>
      
      <!-- BUYER & INVOICE META -->
      <div class="buyer-row">
        <div class="buyer-section">
          <strong style="font-size:12px;">${user.store_name || 'Customer'}</strong><br/>
          ${user.address || 'Address not provided'}<br/>
          Mob: ${user.phone || '-'}
          ${user.drug_license ? '<br/>DL No: ' + user.drug_license : ''}
          ${user.gst_number ? '<br/>GST No: <strong>' + user.gst_number + '</strong>' : ''}
        </div>
        <div class="buyer-section" style="border-right: none;">
          <div class="invoice-title">GST Invoice</div>
          <div style="padding: 4px;">
            <span class="meta-label">Inv No</span> <span class="meta-value">: ${invoiceNo}</span><br/>
            <span class="meta-label">Date</span> <span class="meta-value">: ${invoiceDate}</span><br/>
            <span class="meta-label">Due Date</span> <span class="meta-value">: ${dueDate}</span><br/>
            <span class="meta-label">Mobile</span> <span class="meta-value">: ${COMPANY.mobile}</span>
          </div>
        </div>
      </div>
      
      <!-- ITEMS TABLE -->
      <table>
        <thead>
          <tr>
            <th>Sno</th><th>Product Name</th><th>Pack</th><th>Mfr</th><th>HSN</th><th>Batch</th><th>Exp</th><th>Qty</th><th>Free</th><th>MRP</th><th>Rate</th><th>Disc</th><th>GST%</th><th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      
      <!-- TOTALS BAR -->
      <div class="totals-bar">
        <span>Total Items: ${order.items?.length || 0}</span>
        <span>Total Qty: ${totalQty}</span>
        <span>Total Outstandings: ₹${(user.credit_balance || 0).toFixed(2)}</span>
      </div>
      
      <!-- GST BREAKDOWN + AMOUNT SUMMARY -->
      <div class="summary-row">
        <div class="gst-table">
          <table>
            <tr><th>Sales</th><th>GST-0%</th><th>GST-5%</th><th>GST-12%</th><th>GST-18%</th><th>GST-28%</th></tr>
            <tr><td><strong>GST/IGST</strong></td><td></td><td>₹${taxableValue.toFixed(2)}</td><td></td><td></td><td></td></tr>
            <tr><td><strong>GST TAX</strong></td><td></td><td>₹${gstAmount.toFixed(2)}</td><td></td><td></td><td></td></tr>
            <tr><td><strong>CGST</strong></td><td></td><td>2.5% ₹${cgst.toFixed(2)}</td><td>6%</td><td>9%</td><td>14% 0.00</td></tr>
            <tr><td><strong>SGST</strong></td><td></td><td>2.5% ₹${sgst.toFixed(2)}</td><td>6%</td><td>9%</td><td>14% 0.00</td></tr>
          </table>
        </div>
        <div class="amount-summary">
          <div class="amount-row"><span>Sub Total</span><span class="amount-value">₹${taxableValue.toFixed(2)}</span></div>
          <div class="amount-row"><span>Discount</span><span class="amount-value">₹${discount.toFixed(2)}</span></div>
          <div class="amount-row"><span>Tax Amount</span><span class="amount-value">₹${gstAmount.toFixed(2)}</span></div>
          <div class="amount-row"><span>Freight</span><span class="amount-value">₹0.00</span></div>
          <div class="amount-row"><span>Credit Not</span><span class="amount-value">₹0.00</span></div>
          <div class="amount-row"><span>Debit Note</span><span class="amount-value">₹0.00</span></div>
          <div class="amount-row"><span>Round off</span><span class="amount-value">₹${roundOff.toFixed(2)}</span></div>
          <div class="net-amount"><span>Net Amount</span><span>₹${netAmount.toFixed(2)}</span></div>
        </div>
      </div>
      
      <!-- AMOUNT IN WORDS -->
      <div class="words-row">
        ${numberToWords(netAmount)}
      </div>
      
      <!-- FOOTER -->
      <div class="footer">
        <div class="terms">
          <strong>Terms & Conditions:</strong><br/>
          1. Goods once sold will not be taken back.<br/>
          2. Payment due strictly within 60 days of dispatch.<br/>
          3. Late payments may incur penalties.
        </div>
        <div class="signature">
          For <strong>${COMPANY.name}</strong>
          <br/><br/><br/>
          Authorised Signatory
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
};

// Generate and share invoice PDF
const handleInvoiceGenerate = async (order: any, user: any) => {
  try {
    const html = generateInvoiceHTML(order, user);
    const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (err) {
    Alert.alert('Error', 'Could not generate invoice. Please try again.');
  }
};

const useStore = create((set, get) => ({
  serverIp: DEFAULT_IP,
  setServerIp: (ip) => set({ serverIp: ip }),
  user: null,
  setUser: (user) => set({ user }),
  sessionId: null,
  setSessionId: (sessionId) => set({ sessionId }),
  // Auth headers for every protected API call. The session_id (issued by
  // /api/auth/verify) is sent as a Bearer token the backend validates.
  authHeaders: () => {
    const sid = get().sessionId;
    return sid
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sid}` }
      : { 'Content-Type': 'application/json' };
  },
  cart: {},
  products: [],
  setProducts: (products) => set({ products }),
  usersList: [],
  setUsersList: (usersList) => set({ usersList }),
  addToCart: (productId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    set((state) => ({ cart: { ...state.cart, [productId]: (state.cart[productId] || 0) + 1 } }));
  },
  removeFromCart: (productId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    set((state) => {
      const newCart = { ...state.cart };
      if (newCart[productId] > 1) {
        newCart[productId] -= 1;
      } else {
        delete newCart[productId];
      }
      return { cart: newCart };
    });
  },
  setCartQuantity: (productId, qty) => {
    set((state) => {
      const newCart = { ...state.cart };
      const parsedQty = parseInt(qty);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        delete newCart[productId];
      } else {
        newCart[productId] = parsedQty;
      }
      return { cart: newCart };
    });
  },
  clearCart: () => set({ cart: {} }),
  orders: [],
  setOrders: (orders) => set({ orders }),
  
  // Production builds use the HTTPS base URL baked in via app.config.js
  // (extra.apiBaseUrl). The plain-IP override is a LOCAL DEV fallback only.
  getBaseUrl: () => API_BASE_URL || `http://${get().serverIp}:3000`,
  getApiUrl: () => `${get().getBaseUrl()}/api/data`,
  getTokenUrl: () => `${get().getBaseUrl()}/api/user/token`,
  getDeleteAccountUrl: () => `${get().getBaseUrl()}/api/user/delete`,
  getOtpUrl: () => `${get().getBaseUrl()}/api/auth/otp`,
  getVerifyUrl: () => `${get().getBaseUrl()}/api/auth/verify`,
  getSignupUrl: () => `${get().getBaseUrl()}/api/auth/signup`,
  getSchemesUrl: () => `${get().getBaseUrl()}/api/schemes`,
  getSchemesValidateUrl: () => `${get().getBaseUrl()}/api/schemes/validate`,

  // Schemes / Coupons
  schemes: [],
  setSchemes: (schemes) => set({ schemes }),
  appliedCoupon: null,
  setAppliedCoupon: (coupon) => set({ appliedCoupon: coupon }),
  clearCoupon: () => set({ appliedCoupon: null }),
  placeOrder: async (order) => {
    try {
      const res = await fetch(get().getApiUrl(), {
        method: 'POST',
        headers: get().authHeaders(),
        body: JSON.stringify({ collection: 'orders', item: order, action: 'create' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Order Failed', err.error || 'Server error. Please try again.');
        return false;
      }
    } catch (e) {
      Alert.alert('Connection Error', 'Failed to reach the server. Please verify the IP address.');
      return false;
    }

    set((state) => ({
      orders: [order, ...state.orders],
      cart: {},
      appliedCoupon: null,
      user: state.user ? { ...state.user, credit_balance: state.user.credit_balance + order.total } : null
    }));
    return true;
  },
}));

// Notifications helper
async function registerForPushNotificationsAsync() {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B4332',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId || undefined })).data;
  } else {
    console.log('Must use physical device for Push Notifications');
  }
  return token;
}


const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kancheepuram', 'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupattur', 'Tirupur', 'Tiruvallur', 'Tiruvannamalai', 'Vellore', 'Villupuram', 'Virudhunagar'
];

// --- Premium Text Input ---
const PremiumTextInput = ({ label, value, onChangeText, keyboardType = 'default', icon }) => {
  const [isFocused, setIsFocused] = useState(false);
  const animValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: isFocused || value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused, value]);

  const labelStyle = {
    position: 'absolute',
    left: 0,
    top: animValue.interpolate({ inputRange: [0, 1], outputRange: [18, 6] }),
    fontSize: animValue.interpolate({ inputRange: [0, 1], outputRange: [14, 10] }),
    color: animValue.interpolate({ inputRange: [0, 1], outputRange: ['#64748b', BRAND[500]] }),
    fontWeight: '800',
    letterSpacing: 0.5,
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ 
        backgroundColor: '#0A1E13', 
        borderRadius: 14, 
        borderWidth: 1.5, 
        borderColor: isFocused ? BRAND[500] : 'rgba(216, 243, 220, 0.05)',
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        ...(isFocused ? SHADOWS.glowGreen : {})
      }}>
        {icon && <Ionicons name={icon} size={18} color={isFocused ? BRAND[500] : '#475569'} style={{ marginRight: 12 }} />}
        <View style={{ flex: 1, position: 'relative', height: '100%', justifyContent: 'center' }}>
          <Animated.Text style={labelStyle}>{label}</Animated.Text>
          <TextInput
            style={{ color: '#fff', fontSize: 15, fontWeight: '700', height: '100%', paddingTop: 16, paddingBottom: 0 }}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            keyboardType={keyboardType}
          />
        </View>
      </View>
    </View>
  );
};

// --- Signup Screen ---
function SignupScreen({ setCurrentScreen }) {
  const [form, setForm] = useState({ phone: '', store_name: '', user_type: 'Retailer', drug_license: '', gst_number: '', registration_number: '', address: '', email: '', zone: 'Tamil Nadu', city: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tempIp, setTempIp] = useState('');
  
  const serverIp = useStore((state) => state.serverIp);
  const setServerIp = useStore((state) => state.setServerIp);
  const getSignupUrl = useStore((state) => state.getSignupUrl);

  // Entrance Animations
  const boxAnims = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => { 
    setTempIp(serverIp); 
    Animated.stagger(150, boxAnims.map(anim => Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 8 }))).start();
  }, [serverIp]);

  const handleSignup = async () => {
    if(!form.phone || !form.store_name) return Alert.alert('Error', 'Phone and Firm Name are required.');
    
    setIsLoading(true);
    try {
      const res = await fetch(getSignupUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if(data.success) {
        Alert.alert('Success', 'Registration submitted. Awaiting admin approval.');
        setCurrentScreen('Login');
      } else {
        Alert.alert('Error', data.error || 'Signup failed');
      }
    } catch (e) {
      Alert.alert('Error', 'Network Error');
    }
    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#05120B' }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* Hero Header */}
        <View style={{ marginBottom: 32, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', marginBottom: 16, ...SHADOWS.glowGreen }}>
            <Ionicons name="shield-checkmark" size={32} color="#fff" />
          </View>
          <Text style={{ fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 }}>Register Firm</Text>
          <Text style={{ fontSize: 14, color: '#94a3b8', fontWeight: '600', marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>Join the B2B Command Network</Text>
        </View>

        {/* Bento Box 1: Identity */}
        <Animated.View style={{ opacity: boxAnims[0], transform: [{ translateY: boxAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }], backgroundColor: '#0D2A1B', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(216, 243, 220, 0.1)' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase' }}>Identity</Text>
          <PremiumTextInput label="Firm / Clinic Name" icon="business" value={form.store_name} onChangeText={(t) => setForm({...form, store_name: t})} />
          <PremiumTextInput label="Phone Number" icon="call" keyboardType="phone-pad" value={form.phone} onChangeText={(t) => setForm({...form, phone: t})} />
          <PremiumTextInput label="Email Address" icon="mail" keyboardType="email-address" value={form.email} onChangeText={(t) => setForm({...form, email: t})} />
        </Animated.View>

        {/* Bento Box 2: Role */}
        <Animated.View style={{ opacity: boxAnims[1], transform: [{ translateY: boxAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }], backgroundColor: '#0D2A1B', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(216, 243, 220, 0.1)' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase' }}>Select Role</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            {['Retailer', 'Clinic', 'Doctor', 'Pharmacy'].map(type => {
              // Map 'Pharmacy' back to 'Doctor with Pharmacy' for data consistency
              const actualType = type === 'Pharmacy' ? 'Doctor with Pharmacy' : type;
              const isSelected = form.user_type === actualType;
              return (
                <TouchableOpacity 
                  key={actualType} 
                  onPress={() => { Haptics.selectionAsync(); setForm({...form, user_type: actualType}); }} 
                  style={{
                    width: '48%', 
                    backgroundColor: isSelected ? BRAND[800] : '#0A1E13', 
                    borderRadius: 16, 
                    padding: 16, 
                    borderWidth: 1.5, 
                    borderColor: isSelected ? BRAND[500] : 'transparent',
                    ...(isSelected ? SHADOWS.glowGreen : {})
                  }}
                  activeOpacity={0.9}
                >
                  <Ionicons name={type === 'Retailer' ? 'storefront' : type === 'Clinic' ? 'business' : type === 'Doctor' ? 'medkit' : 'fitness'} size={24} color={isSelected ? '#fff' : '#475569'} style={{marginBottom: 12}} />
                  <Text style={{color: isSelected ? '#fff' : '#94a3b8', fontWeight: isSelected ? '800' : '600', fontSize: 13}}>{type}</Text>
                  {isSelected && <View style={{ position: 'absolute', top: 12, right: 12 }}><Ionicons name="checkmark-circle" size={16} color="#fff" /></View>}
                </TouchableOpacity>
              )
            })}
          </View>
        </Animated.View>

        {/* Bento Box 3: Location */}
        <Animated.View style={{ opacity: boxAnims[2], transform: [{ translateY: boxAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }], backgroundColor: '#0D2A1B', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(216, 243, 220, 0.1)' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase' }}>Location</Text>
          
          <TouchableOpacity 
            style={{ backgroundColor: '#0A1E13', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(216, 243, 220, 0.05)', height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 12 }}
            onPress={() => { Haptics.selectionAsync(); setShowCityPicker(true); }}
            activeOpacity={0.8}
          >
            <Ionicons name="map" size={18} color={BRAND[500]} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: form.city ? '#fff' : '#64748b', fontSize: 15, fontWeight: '700' }}>{form.city || 'Select District'}</Text>
              {form.city && <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '800', marginTop: 2 }}>TAMIL NADU</Text>}
            </View>
            <Ionicons name="chevron-down" size={18} color="#475569" />
          </TouchableOpacity>

          <PremiumTextInput label="Full Delivery Address" icon="location" value={form.address} onChangeText={(t) => setForm({...form, address: t})} />
        </Animated.View>

        {/* Bento Box 4: Credentials */}
        <Animated.View style={{ opacity: boxAnims[3], transform: [{ translateY: boxAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }], backgroundColor: '#0D2A1B', borderRadius: 24, padding: 20, marginBottom: 32, borderWidth: 1, borderColor: 'rgba(216, 243, 220, 0.1)' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase' }}>Compliance & Credentials</Text>
          {form.user_type !== 'Doctor' && <PremiumTextInput label="Drug License Number" icon="document-text" value={form.drug_license} onChangeText={(t) => setForm({...form, drug_license: t})} />}
          {(form.user_type === 'Retailer' || form.user_type === 'Doctor with Pharmacy') && <PremiumTextInput label="GST Number" icon="receipt" value={form.gst_number} onChangeText={(t) => setForm({...form, gst_number: t})} />}
          {form.user_type !== 'Retailer' && <PremiumTextInput label="Registration Number" icon="shield-checkmark" value={form.registration_number} onChangeText={(t) => setForm({...form, registration_number: t})} />}
        </Animated.View>

        {/* Submit */}
        <AnimatedPressable style={[styles.buttonPrimary, { marginBottom: 24, paddingVertical: 18, ...SHADOWS.glowGreen }]} onPress={handleSignup} disabled={isLoading}>
          <Text style={[styles.buttonPrimaryText, { fontSize: 18 }]}>{isLoading ? 'Submitting...' : 'Submit Application'}</Text>
        </AnimatedPressable>
        
        <TouchableOpacity style={{ alignItems: 'center', marginBottom: 12 }} onPress={() => setCurrentScreen('Login')}>
          <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 14 }}>Already registered? <Text style={{color: BRAND[500], fontWeight: '900'}}>Log In</Text></Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: 'center', marginBottom: 40 }} onPress={() => setShowConfig(true)}>
          <Text style={{ color: '#475569', fontWeight: '800', fontSize: 10, letterSpacing: 1 }}>NETWORK SETUP</Text>
        </TouchableOpacity>

        {/* City/District Picker Modal */}
        <Modal visible={showCityPicker} transparent animationType="slide">
          <View style={styles.modalOverlayBottom}>
            <View style={[styles.bottomSheet, { maxHeight: '70%', backgroundColor: '#0B2618', paddingBottom: 40 }]}>
              <View style={styles.dragHandle} />
              <Text style={[styles.modalTitle, { color: '#fff' }]}>Select District</Text>
              <Text style={{color: BRAND[500], fontSize: 13, marginBottom: 16, fontWeight: '800', letterSpacing: 1}}>{form.zone.toUpperCase()}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {TN_DISTRICTS.map(city => (
                  <TouchableOpacity key={city} style={{ paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: form.city === city ? BRAND[800] : 'transparent' }} onPress={() => { Haptics.selectionAsync(); setForm({...form, city}); setShowCityPicker(false); }}>
                    <Text style={{fontSize: 16, fontWeight: form.city === city ? '900' : '600', color: form.city === city ? '#fff' : '#cbd5e1'}}>{city}</Text>
                    {form.city === city && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <AnimatedPressable style={[styles.buttonPrimary, {marginTop: 16, backgroundColor: '#0A1E13', borderWidth: 1, borderColor: '#1e293b'}]} onPress={() => setShowCityPicker(false)}>
                <Text style={[styles.buttonPrimaryText, { color: '#fff' }]}>Close</Text>
              </AnimatedPressable>
            </View>
          </View>
        </Modal>

        {/* Network Config Modal */}
        <Modal visible={showConfig} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Network Setup</Text>
              <Text style={{ marginBottom: 20, color: '#64748b', fontSize: 14 }}>Enter the Next.js API IPv4 address.</Text>
              <TextInput style={styles.inputFieldConfig} value={tempIp} onChangeText={setTempIp} placeholder="192.168.x.x" keyboardType="numbers-and-punctuation"/>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity onPress={() => setShowConfig(false)} style={styles.btnCancel}><Text style={{ fontWeight: '700', color: '#475569' }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { setServerIp(tempIp); setShowConfig(false); }} style={styles.btnSave}><Text style={{ color: '#fff', fontWeight: '800' }}>Save IP</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


// --- Login Screen (Premium Animated) ---
function LoginScreen({ setCurrentScreen }) {
  const [phone, setPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tempIp, setTempIp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(100)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const otpBoxAnims = useRef([0,1,2,3].map(() => new Animated.Value(0))).current;
  const otpInputRefs = useRef([]);

  const setUser = useStore((state) => state.setUser);
  const serverIp = useStore((state) => state.serverIp);
  const setServerIp = useStore((state) => state.setServerIp);
  const getOtpUrl = useStore((state) => state.getOtpUrl);
  const getVerifyUrl = useStore((state) => state.getVerifyUrl);

  useEffect(() => { setTempIp(serverIp); }, [serverIp]);

  // Entrance animation sequence
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7, delay: 200 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true, delay: 200 }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(titleTranslateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      ]),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(cardTranslateY, { toValue: 0, useNativeDriver: true, tension: 40, friction: 9 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // Pulse loop for CTA button
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, []);

  // Animate OTP boxes when OTP is sent
  useEffect(() => {
    if (otpSent) {
      otpBoxAnims.forEach((anim, idx) => {
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8, delay: idx * 100 }).start();
      });
    }
  }, [otpSent]);

  const handleOtpChange = (text, index) => {
    const newDigits = [...otpDigits];
    newDigits[index] = text;
    setOtpDigits(newDigits);
    // Auto-focus next
    if (text && index < 3) {
      otpInputRefs.current[index + 1]?.focus();
    }
    // Auto-submit on last digit
    if (text && index === 3) {
      Keyboard.dismiss();
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const requestOtp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if(phone.length < 10) return Alert.alert('Invalid', 'Enter valid 10-digit phone');
    setIsLoading(true);
    try {
      const res = await fetch(getOtpUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if(data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setOtpSent(true);
      }
      else Alert.alert('Error', data.error || 'Failed to send OTP');
    } catch(e) { Alert.alert('Error', 'Network connection failed.'); }
    setIsLoading(false);
  };

  const verifyOtp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const otp = otpDigits.join('');
    if (otp.length < 4) return Alert.alert('Error', 'Enter all 4 digits');
    setIsLoading(true);
    try {
      const res = await fetch(getVerifyUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, device_info: Platform.OS })
      });
      const data = await res.json();
      if(data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useStore.getState().setSessionId(data.session_id);
        setUser(data.user);
        setCurrentScreen('Home');
        // Register push token in the background after login — non-blocking.
        registerForPushNotificationsAsync().then((pushToken) => {
          if (!pushToken) return;
          fetch(useStore.getState().getTokenUrl(), {
            method: 'POST',
            headers: useStore.getState().authHeaders(),
            body: JSON.stringify({ token: pushToken }),
          }).catch(() => {/* non-critical */});
        });
      } else if (data.pending) {
        setUser(data.user);
        setCurrentScreen('PendingApproval');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Access Denied', data.error || 'Invalid OTP');
      }
    } catch(e) { Alert.alert('Error', 'Network connection failed.'); }
    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.loginContainer} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Animated Hero */}
        <View style={styles.loginHero}>
          <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
            <Image source={require('./assets/pharma_logo.jpeg')} style={styles.loginLogo} resizeMode="contain" />
          </Animated.View>
          <Animated.Text style={[styles.companyName, { opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }]}>UPKEM LABS</Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>PHARMA · DISTRIBUTOR PORTAL</Animated.Text>
        </View>

        {/* Animated Login Card */}
        <Animated.View style={[styles.loginCard, { transform: [{ translateY: cardTranslateY }], opacity: cardOpacity }]}>
          <View style={styles.dragHandle} />
          <Text style={styles.loginTitle}>{otpSent ? 'Verify your\nidentity.' : 'Sign in to your\ndistributor account.'}</Text>
          <Text style={styles.loginSubtitle}>{otpSent ? `4-digit code sent to +91 ${phone}` : 'Enter the phone number registered with Upkem.\nWe\'ll send a secure OTP.'}</Text>
          
          {otpSent && (
            <TouchableOpacity onPress={() => { setOtpSent(false); setOtpDigits(['','','','']); }} style={{ marginTop: -16, marginBottom: 20 }}>
              <Text style={{color: BRAND[800], fontWeight: '800', fontSize: 14}}>← Change number</Text>
            </TouchableOpacity>
          )}

          {!otpSent ? (
            <>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputPrefix}>+91</Text>
                <View style={styles.inputDivider} />
                <TextInput style={styles.inputField} placeholder="00000 00000" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={10} returnKeyType="done" />
              </View>
              <Text style={{color: '#6B7280', fontSize: 13, marginBottom: 24, lineHeight: 20}}>By continuing you agree to Upkem's <Text style={{textDecorationLine: 'underline', fontWeight: '700'}}>Terms</Text> & <Text style={{textDecorationLine: 'underline', fontWeight: '700'}}>Privacy Policy</Text></Text>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <AnimatedPressable style={styles.buttonPrimary} onPress={requestOtp} disabled={isLoading}>
                  <Text style={styles.buttonPrimaryText}>{isLoading ? 'Sending...' : 'Send OTP  →'}</Text>
                </AnimatedPressable>
              </Animated.View>
            </>
          ) : (
            <>
              {/* Individual OTP Boxes */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 32 }}>
                {[0,1,2,3].map((idx) => (
                  <Animated.View key={idx} style={{ 
                    transform: [{ scale: otpBoxAnims[idx].interpolate({ inputRange: [0,1], outputRange: [0.5, 1] }) }],
                    opacity: otpBoxAnims[idx],
                  }}>
                    <TextInput
                      ref={ref => otpInputRefs.current[idx] = ref}
                      style={{
                        width: 60, height: 68, borderRadius: 20, textAlign: 'center',
                        fontSize: 28, fontWeight: '900', color: '#1A1A1A',
                        backgroundColor: otpDigits[idx] ? BRAND[50] : '#f8fafc',
                        borderWidth: 2.5,
                        borderColor: otpDigits[idx] ? BRAND[800] : '#e2e8f0',
                      }}
                      keyboardType="number-pad"
                      maxLength={1}
                      value={otpDigits[idx]}
                      onChangeText={(t) => handleOtpChange(t, idx)}
                      onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                      selectTextOnFocus
                    />
                  </Animated.View>
                ))}
              </View>
              <AnimatedPressable style={styles.buttonPrimary} onPress={verifyOtp} disabled={isLoading}>
                <Text style={styles.buttonPrimaryText}>{isLoading ? 'Verifying...' : 'Authenticate'}</Text>
              </AnimatedPressable>
              <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={requestOtp}>
                <Text style={{color: '#64748b', fontWeight: '700', fontSize: 13}}>Didn't get the code? <Text style={{color: BRAND[800], fontWeight: '900'}}>Resend OTP</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* Trust Badges */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="shield-checkmark" size={14} color={BRAND[600]} />
              <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700' }}>256-bit Encrypted</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={14} color={BRAND[600]} />
              <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700' }}>UPKEM Verified</Text>
            </View>
          </View>

          <TouchableOpacity style={{ marginTop: 24 }} onPress={() => setCurrentScreen('Signup')}>
            <Text style={styles.configText}>New distributor? <Text style={{color: BRAND[800], fontWeight: '900'}}>Request access</Text></Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setShowConfig(true)}>
            <Text style={[styles.configText, { fontSize: 11 }]}>NETWORK CONFIGURATION</Text>
          </TouchableOpacity>

          {/* Version badge */}
          <Text style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: '#cbd5e1', fontWeight: '600' }}>v{APP_VERSION} · UPKEM LABS</Text>
        </Animated.View>

        <Modal visible={showConfig} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Network Setup</Text>
              <Text style={{ marginBottom: 20, color: '#64748b', fontSize: 14 }}>Enter the Next.js API IPv4 address.</Text>
              <TextInput style={styles.inputFieldConfig} value={tempIp} onChangeText={setTempIp} placeholder="192.168.x.x" keyboardType="numbers-and-punctuation"/>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity onPress={() => setShowConfig(false)} style={styles.btnCancel}><Text style={{ fontWeight: '700', color: '#475569' }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { setServerIp(tempIp); setShowConfig(false); }} style={styles.btnSave}><Text style={{ color: '#fff', fontWeight: '800' }}>Save IP</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Pending Approval ---
function PendingApprovalScreen({ setCurrentScreen }) {
  const setUser = useStore((state) => state.setUser);
  
  const handleLogout = () => {
    setUser(null);
    setCurrentScreen('Login');
  };

  return (
    <View style={styles.centeredContainer}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pendingCard}>
        <View style={[styles.iconCircle, { backgroundColor: BRAND[50], borderWidth: 2, borderColor: BRAND[100] }]}>
          <Ionicons name="time-outline" size={36} color={BRAND[800]} />
        </View>
        <Text style={styles.pendingTitle}>Waiting for admin approval</Text>
        <Text style={styles.pendingDesc}>Your request has been received. The Upkem team typically verifies new distributors within <Text style={{fontWeight: '900'}}>24 hours</Text>. You'll get an SMS the moment your account is live.</Text>
        <View style={{ backgroundColor: BRAND[50], padding: 16, borderRadius: 16, marginTop: 24, width: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BRAND[100] }}>
          <Ionicons name="call-outline" size={20} color={BRAND[800]} style={{marginRight: 12}} />
          <View>
            <Text style={{fontSize: 12, color: '#6B7280', fontWeight: '500'}}>Need it faster? Call your rep</Text>
            <Text style={{fontSize: 16, fontWeight: '800', color: BRAND[800]}}>+91 80 4567 8900</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 24, width: '100%', backgroundColor: '#fff', borderWidth: 1.5, borderColor: BRAND[800] }]} onPress={handleLogout}>
          <Text style={[styles.buttonPrimaryText, {color: BRAND[800]}]}>Use a different number</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Home Screen (MedPlus-style) ---
const HOME_CATEGORIES = [
  { name: 'Analgesics',       icon: 'medkit-outline',          bg: BRAND[100] },
  { name: 'Antibiotics',      icon: 'medical-outline',         bg: BRAND[100] },
  { name: 'Diabetic Care',    icon: 'fitness-outline',         bg: BRAND[100] },
  { name: 'Allergy',          icon: 'leaf-outline',            bg: BRAND[100] },
  { name: 'Gastrointestinal', icon: 'nutrition-outline',       bg: BRAND[100] },
  { name: 'Vitamins',         icon: 'sunny-outline',           bg: BRAND[100] },
  { name: 'Devices',          icon: 'hardware-chip-outline',   bg: BRAND[100] },
  { name: 'Syrups',           icon: 'flask-outline',           bg: BRAND[100] },
  { name: 'First Aid',        icon: 'bandage-outline',         bg: BRAND[100] },
  { name: 'Ointments',        icon: 'color-fill-outline',      bg: BRAND[100] },
];

function HomeScreen({ setCurrentScreen, onCategorySelect, onRefresh }) {
  const products = useStore((s) => s.products);
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const schemes = useStore((s) => s.schemes)?.filter(s => s.is_active);
  const featured = products.slice(0, 8);
  const lastOrder = orders.length > 0 ? orders[0] : null;
  const availableCredit = user ? (user.credit_limit - user.credit_balance) : 0;
  const [refreshing, setRefreshing] = useState(false);
  const creditUtilization = user ? ((user.credit_balance || 0) / (user.credit_limit || 1)) * 100 : 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    if (onRefresh) await onRefresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND[800]} colors={[BRAND[800]]} />}>
        {/* Header with greeting */}
        <View style={styles.homeHeader}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Image source={require('./assets/pharma_logo.jpeg')} style={styles.headerLogo} />
            <View style={{marginLeft: 10}}>
              <Text style={{fontSize: 12, color: '#6B7280', fontWeight: '600'}}>Good {getTimeOfDay()},</Text>
              <Text style={{fontSize: 16, fontWeight: '900', color: BRAND[800], letterSpacing: -0.3}}>{user?.store_name || 'UPKEM LABS'}</Text>
            </View>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
            <TouchableOpacity onPress={() => setCurrentScreen('Orders')}>
              <Ionicons name="notifications-outline" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCurrentScreen('Profile')} style={{width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center'}}>
              <Text style={{color: '#fff', fontWeight: '800', fontSize: 14}}>{user?.store_name?.[0] || 'U'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Credit Health Banner */}
        {creditUtilization > 75 && (
          <TouchableOpacity onPress={() => setCurrentScreen('Profile')} style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: creditUtilization > 90 ? '#FEF2F2' : '#FFF7ED', padding: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: creditUtilization > 90 ? '#FEE2E2' : '#FED7AA' }} activeOpacity={0.85}>
            <Ionicons name={creditUtilization > 90 ? 'warning' : 'alert-circle-outline'} size={20} color={creditUtilization > 90 ? '#DC2626' : '#EA580C'} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: creditUtilization > 90 ? '#991B1B' : '#9A3412' }}>{creditUtilization > 90 ? 'Credit almost full' : 'Credit running low'}</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: creditUtilization > 90 ? '#B91C1C' : '#C2410C', marginTop: 1 }}>₹{availableCredit.toLocaleString('en-IN')} remaining · Tap to view payment options</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        )}

        {/* Search shortcut */}
        <TouchableOpacity style={styles.homeSearchBar} onPress={() => setCurrentScreen('Catalog')} activeOpacity={0.85}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" style={{marginRight: 10}} />
          <Text style={styles.homeSearchPlaceholder}>Search medicines, brands…</Text>
        </TouchableOpacity>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>LAST ORDER</Text>
            <Text style={styles.statValue}>₹{lastOrder ? lastOrder.total?.toLocaleString('en-IN') : '0'}</Text>
            <Text style={styles.statSub}>{lastOrder ? lastOrder.date : '—'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>THIS MONTH</Text>
            <Text style={styles.statValue}>₹{orders.reduce((a, o) => a + (o.total || 0), 0).toLocaleString('en-IN', {notation: 'compact', compactDisplay: 'short'})}</Text>
            <Text style={styles.statSub}>{orders.length} orders</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>CREDIT</Text>
            <Text style={styles.statValue}>₹{availableCredit.toLocaleString('en-IN', {notation: 'compact', compactDisplay: 'short'})}</Text>
            <Text style={styles.statSub}>Available</Text>
          </View>
        </View>

        {/* Active Schemes / Special Offers */}
        {schemes && schemes.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={styles.homeSectionRow}>
              <Text style={styles.homeSectionTitle}>Active Offers</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {schemes.map((scheme, idx) => (
                <View key={scheme.id || idx} style={{ width: 280, backgroundColor: BRAND[800], padding: 20, borderRadius: 20, ...SHADOWS.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <View style={{ backgroundColor: BRAND[600], paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{scheme.scheme_type}</Text>
                    </View>
                    <Ionicons name="pricetag" size={20} color={BRAND[100]} />
                  </View>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.3, marginBottom: 4 }}>{scheme.title}</Text>
                  <Text style={{ color: BRAND[100], fontSize: 13, fontWeight: '500', marginBottom: 16 }}>{scheme.description || 'Apply code at checkout'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignSelf: 'flex-start' }}>
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', marginRight: 6 }}>CODE:</Text>
                    <Text style={{ color: BRAND[800], fontSize: 14, fontWeight: '900', letterSpacing: 1 }}>{scheme.code}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Browse by Category */}
        <View style={styles.homeSectionRow}>
          <Text style={styles.homeSectionTitle}>Browse by category</Text>
          <TouchableOpacity onPress={() => { onCategorySelect('All'); setCurrentScreen('Catalog'); }}>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 16 }}>
          {HOME_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.name}
              style={styles.homeCategoryItem}
              onPress={() => { Haptics.selectionAsync(); onCategorySelect(cat.name); setCurrentScreen('Catalog'); }}
              activeOpacity={0.8}
            >
              <View style={[styles.homeCategoryCircle, { backgroundColor: BRAND[800] }]}>
                <Ionicons name={cat.icon} size={22} color="#fff" />
              </View>
              <Text style={styles.homeCategoryText} numberOfLines={1}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Frequently Ordered */}
        <View style={[styles.homeSectionRow, {marginTop: 8}]}>
          <View>
            <Text style={styles.homeSectionTitle}>Frequently ordered</Text>
            <Text style={{fontSize: 12, color: '#6B7280', fontWeight: '500'}}>Based on last 30 days</Text>
          </View>
          <TouchableOpacity onPress={() => { onCategorySelect('All'); setCurrentScreen('Catalog'); }}>
            <Text style={styles.seeAllText}>View all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {featured.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.featuredCard}
              onPress={() => { onCategorySelect('All'); setCurrentScreen('Catalog'); }}
              activeOpacity={0.8}
            >
              <Image source={{ uri: getProductImage(p) }} style={styles.featuredCardImage} />
              <Text style={styles.featuredCardName} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.featuredCardCompany} numberOfLines={1}>{p.company}</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 10, marginBottom: 10}}>
                <Text style={styles.featuredCardPrice}>₹{p.price_ptr || p.price}</Text>
                <View style={{backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6}}>
                  <Text style={{fontSize: 10, color: '#16a34a', fontWeight: '700'}}>● In stock</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recently Ordered */}
        {lastOrder && (
          <>
            <View style={[styles.homeSectionRow, {marginTop: 8}]}>
              <View>
                <Text style={styles.homeSectionTitle}>Recently ordered</Text>
                <Text style={{fontSize: 12, color: '#6B7280', fontWeight: '500'}}>From order {lastOrder.id}</Text>
              </View>
              <TouchableOpacity onPress={() => setCurrentScreen('Profile')}>
                <Text style={styles.seeAllText}>View all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              {(lastOrder.items || []).slice(0, 4).map((item, idx) => (
                <View key={idx} style={[styles.featuredCard, {width: 160}]}>
                  <Image source={{ uri: getProductImage(item) }} style={styles.featuredCardImage} />
                  <Text style={styles.featuredCardName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.featuredCardCompany} numberOfLines={1}>{item.company}</Text>
                  <Text style={[styles.featuredCardPrice, {marginBottom: 10}]}>₹{item.price_ptr || item.price}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// --- Catalog Screen ---
function CatalogScreen({ setCurrentScreen, initialCategory }) {
  const addToCart = useStore((state) => state.addToCart);
  const removeFromCart = useStore((state) => state.removeFromCart);
  const setCartQuantity = useStore((state) => state.setCartQuantity);
  const cart = useStore((state) => state.cart);
  const productsList = useStore((state) => state.products);
  const user = useStore((state) => state.user);
  const [searchQuery, setSearchQuery] = useState('');

  // Flipkart-style multi-select filters
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory && initialCategory !== 'All' ? [initialCategory] : []
  );
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('All');
  const [sortOption, setSortOption] = useState('name_asc');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const categories = [...new Set(productsList.map(p => p.category).filter(Boolean))].sort() as string[];
  const systems = [...new Set(productsList.map(p => p.body_system).filter(Boolean))].sort() as string[];
  const companies = ['All', ...new Set(productsList.map(p => p.company).filter(Boolean))];

  const toggleCategory = (cat: string) => {
    Haptics.selectionAsync();
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };
  const toggleSystem = (sys: string) => {
    Haptics.selectionAsync();
    setSelectedSystems(prev => prev.includes(sys) ? prev.filter(s => s !== sys) : [...prev, sys]);
  };
  const clearAllFilters = () => { setSelectedCategories([]); setSelectedSystems([]); setSelectedCompany('All'); setSortOption('name_asc'); };
  const activeFilterCount = selectedCategories.length + selectedSystems.length + (selectedCompany !== 'All' ? 1 : 0);

  let filteredProducts = productsList.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) ||
      (p.company || '').toLowerCase().includes(q) ||
      (p.composition || '').toLowerCase().includes(q);
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(p.category);
    const matchesSystem = selectedSystems.length === 0 || selectedSystems.includes(p.body_system);
    const matchesCompany = selectedCompany === 'All' || p.company === selectedCompany;
    return matchesSearch && matchesCategory && matchesSystem && matchesCompany;
  });

  if (sortOption === 'price_asc') filteredProducts.sort((a,b) => (a.price_ptr || a.price) - (b.price_ptr || b.price));
  if (sortOption === 'price_desc') filteredProducts.sort((a,b) => (b.price_ptr || b.price) - (a.price_ptr || a.price));
  if (sortOption === 'name_asc') filteredProducts.sort((a,b) => a.name.localeCompare(b.name));


  const totalValue = Object.keys(cart).reduce((acc, id) => {
    const product = productsList.find(p => p.id === parseInt(id));
    return acc + (product?.price || 0) * cart[id];
  }, 0);
  const isMinMet = totalValue >= MIN_ORDER_VALUE;
  const progressPercent = Math.min((totalValue / MIN_ORDER_VALUE) * 100, 100);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{user?.store_name}</Text>
          <Text style={styles.headerCredit}>Avail. Credit: <Text style={{color: '#0f172a'}}>₹{(user?.credit_limit - user?.credit_balance).toLocaleString('en-IN')}</Text></Text>
        </View>
        <Image source={require('./assets/pharma_logo.jpeg')} style={styles.headerLogo} />
      </View>

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            {/* Search + Filter button row */}
            <View style={styles.searchRow}>
              <View style={[styles.searchContainer, { flex: 1 }]}>
                <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ position: 'absolute', left: 16, zIndex: 2 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search SKUs, brands, composition..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
                onPress={() => setShowFilterPanel(true)}
              >
              <Ionicons name="options-outline" size={16} color={activeFilterCount > 0 ? '#fff' : '#475569'} />
                <Text style={[styles.filterBtnText, activeFilterCount > 0 && { color: '#fff' }]}>Filter</Text>
                {activeFilterCount > 0 && (
                  <View style={styles.filterCountBadge}>
                    <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 4 }}>
                {selectedCategories.map(cat => (
                  <TouchableOpacity key={cat} style={styles.activeChip} onPress={() => toggleCategory(cat)}>
                    <Text style={styles.activeChipText}>{cat} ✕</Text>
                  </TouchableOpacity>
                ))}
                {selectedSystems.map(sys => (
                  <TouchableOpacity key={sys} style={styles.activeChip} onPress={() => toggleSystem(sys)}>
                    <Text style={styles.activeChipText}>{sys} ✕</Text>
                  </TouchableOpacity>
                ))}
                {selectedCompany !== 'All' && (
                  <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedCompany('All')}>
                    <Text style={styles.activeChipText}>{selectedCompany} ✕</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.clearChip} onPress={clearAllFilters}>
                  <Text style={styles.clearChipText}>Clear All</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        }
        data={filteredProducts}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.productCard} onPress={() => setSelectedProduct(item)} activeOpacity={0.8}>
            <Image source={{ uri: getProductImage(item) }} style={styles.productThumb} />
            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productDesc}>{item.company} • {item.category}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.productPrice}>₹{item.price_ptr || item.price}</Text>
                <View style={[styles.stockBadge, item.stock < 10 ? { backgroundColor: '#fee2e2' } : {}]}>
                  <Text style={[styles.stockText, item.stock < 10 ? { color: '#dc2626' } : {}]}>
                    {item.stock > 0 ? `${item.stock} in stock` : 'Out of Stock'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.cartAction}>
              {(!cart[item.id] || cart[item.id] === 0) ? (
                <AnimatedPressable style={styles.addBtn} onPress={() => addToCart(item.id)}>
                  <Text style={styles.addBtnText}>ADD</Text>
                </AnimatedPressable>
              ) : (
                <View style={styles.qtyControls}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => removeFromCart(item.id)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="numeric"
                    selectTextOnFocus
                    value={cart[item.id].toString()}
                    onChangeText={(val) => {
                      if (val === '') setCartQuantity(item.id, 0);
                      else setCartQuantity(item.id, parseInt(val) || 1);
                    }}
                  />
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => addToCart(item.id)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}></Text>
            <Ionicons name="cube-outline" size={40} color="#94a3b8" style={{marginBottom: 8}} />
            <Text style={styles.emptyText}>No products found.</Text>
          </View>
        }
      />

      {/* Product Details Modal */}
      <Modal visible={!!selectedProduct} transparent animationType="slide">
        <View style={styles.modalOverlayBottom}>
          <View style={[styles.bottomSheet, { maxHeight: '88%' }]}>
            <View style={styles.dragHandle} />
            {selectedProduct && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Image source={{ uri: getProductImage(selectedProduct) }} style={styles.detailImage} />
                <Text style={styles.modalTitle}>{selectedProduct.name}</Text>
                <Text style={{ color: '#64748b', fontSize: 16, marginBottom: 12 }}>{selectedProduct.company}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <View style={styles.systemPillActive}><Text style={styles.systemTextActive}>{selectedProduct.category}</Text></View>
                  {selectedProduct.body_system ? <View style={styles.systemPill}><Text style={styles.systemText}>{selectedProduct.body_system}</Text></View> : null}
                </View>
                <View style={styles.detailInfoBox}>
                  <Text style={styles.detailInfoLabel}>Composition</Text>
                  <Text style={styles.detailInfoValue}>{selectedProduct.composition || 'Standard Formulation'}</Text>
                </View>
                <View style={styles.detailInfoBox}>
                  <Text style={styles.detailInfoLabel}>Description & Usage</Text>
                  <Text style={[styles.detailInfoValue, { color: '#475569', lineHeight: 22 }]}>
                    {selectedProduct.description || 'No description available for this SKU.'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, backgroundColor: '#f8fafc', padding: 16, borderRadius: 16 }}>
                  <View>
                    <Text style={styles.detailInfoLabel}>PTR Price</Text>
                    <Text style={{ fontSize: 26, fontWeight: '900', color: '#0f172a' }}>₹{selectedProduct.price_ptr || selectedProduct.price}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.detailInfoLabel}>MRP</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#94a3b8', textDecorationLine: 'line-through' }}>
                      ₹{selectedProduct.mrp || Math.round((selectedProduct.price_ptr || selectedProduct.price) * 1.2)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailInfoLabel}>Packing</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>{selectedProduct.packing || '1×10'}</Text>
                  </View>
                </View>
              </ScrollView>
            )}
            <AnimatedPressable style={[styles.buttonPrimary, { marginTop: 20 }]} onPress={() => setSelectedProduct(null)}>
              <Text style={styles.buttonPrimaryText}>Close</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>

      {/* Flipkart-style Filter Panel */}
      <Modal visible={showFilterPanel} transparent animationType="slide">
        <View style={styles.modalOverlayBottom}>
          <View style={[styles.bottomSheet, { maxHeight: '88%' }]}>
            <View style={styles.dragHandle} />
            <View style={styles.filterPanelHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={clearAllFilters}><Text style={styles.clearAllText}>Reset all</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Sort */}
              <Text style={styles.filterSectionTitle}>Sort By</Text>
              {([
                { key: 'name_asc',   label: 'Name (A → Z)' },
                { key: 'price_asc',  label: 'Price: Low to High' },
                { key: 'price_desc', label: 'Price: High to Low' },
              ] as const).map(opt => (
                <TouchableOpacity key={opt.key} style={styles.filterRadioRow} onPress={() => { Haptics.selectionAsync(); setSortOption(opt.key); }}>
                  <View style={[styles.radioOuter, sortOption === opt.key && styles.radioOuterActive]}>
                    {sortOption === opt.key && <View style={styles.radioInner} />}
                  </View>
                  <Text style={[styles.filterOptionText, sortOption === opt.key && styles.filterOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}

              {/* Company (multi-select with checkmarks) */}
              <Text style={styles.filterSectionTitle}>Company</Text>
              <View style={styles.filterChipsWrap}>
                {companies.filter(c => c !== 'All').map(c => {
                  const isSelected = selectedCompany === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.filterChip, isSelected && styles.filterChipActive]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedCompany(isSelected ? 'All' : c); }}
                    >
                      <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                        {isSelected ? '✓ ' : ''}{c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Category (with Ionicons) */}
              <Text style={styles.filterSectionTitle}>Category</Text>
              <View style={styles.filterChipsWrap}>
                {categories.map(cat => {
                  const catConfig = HOME_CATEGORIES.find(hc => hc.name === cat);
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.filterChip, isSelected && styles.filterChipActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                      onPress={() => toggleCategory(cat)}
                    >
                      {catConfig && <Ionicons name={catConfig.icon} size={14} color={isSelected ? BRAND[800] : '#64748b'} />}
                      <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Body System */}
              {systems.length > 0 && (
                <>
                  <Text style={styles.filterSectionTitle}>Body System / Target</Text>
                  <View style={styles.filterChipsWrap}>
                    {systems.map(sys => (
                      <TouchableOpacity
                        key={sys}
                        style={[styles.filterChip, selectedSystems.includes(sys) && styles.filterChipActive]}
                        onPress={() => toggleSystem(sys)}
                      >
                        <Text style={[styles.filterChipText, selectedSystems.includes(sys) && styles.filterChipTextActive]}>{sys}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
            {/* Footer: Reset + Apply */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity 
                style={{ flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0' }} 
                onPress={() => { clearAllFilters(); setShowFilterPanel(false); }}
              >
                <Text style={{ fontWeight: '700', fontSize: 15, color: '#475569' }}>Reset</Text>
              </TouchableOpacity>
              <AnimatedPressable 
                style={{ flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', backgroundColor: BRAND[800] }} 
                onPress={() => setShowFilterPanel(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Apply filters</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>

      {Object.keys(cart).length > 0 && (
        <AnimatedPressable 
          style={[styles.smartCartTracker, isMinMet ? SHADOWS.glowEmerald : SHADOWS.glowGreen]}
          onPress={() => { Haptics.selectionAsync(); setCurrentScreen('Cart'); }}
        >
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text style={styles.smartCartTitle}>
              {isMinMet ? `₹${totalValue.toLocaleString('en-IN')} Ready to Checkout` : `₹${totalValue.toLocaleString('en-IN')} / ₹${MIN_ORDER_VALUE.toLocaleString('en-IN')} Min`}
            </Text>
            <View style={styles.smartCartProgressBg}>
              <View style={[styles.smartCartProgressFill, { width: `${progressPercent}%`, backgroundColor: isMinMet ? '#34d399' : BRAND[500] }]} />
            </View>
          </View>
          <View style={[styles.smartCartBtn, isMinMet ? { backgroundColor: '#10b981' } : {}]}>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </View>
        </AnimatedPressable>
      )}
    </View>
  );
}

// --- Cart Screen (Spec 12/13) ---
function CartScreen({ setCurrentScreen }) {
  const cart = useStore((state) => state.cart);
  const products = useStore((state) => state.products);
  const addToCart = useStore((state) => state.addToCart);
  const removeFromCart = useStore((state) => state.removeFromCart);
  const setCartQuantity = useStore((state) => state.setCartQuantity);
  const user = useStore((state) => state.user);

  const cartItems = Object.keys(cart).map(id => {
    const product = products.find(p => p.id === parseInt(id));
    return { ...product, quantity: cart[id] };
  }).filter(i => i.id);

  const subtotal = cartItems.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0);
  const gst = Math.round(subtotal * 0.12 * 100) / 100;
  const totalValue = Math.round((subtotal + gst) * 100) / 100;
  const isMinMet = subtotal >= MIN_ORDER_VALUE;
  const amountNeeded = MIN_ORDER_VALUE - subtotal;

  const deleteFromCart = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCartQuantity(id, 0);
  };

  if (cartItems.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.iconCircleLg}><Ionicons name="cart-outline" size={40} color={BRAND[800]} /></View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 }}>Cart is Empty</Text>
        <Text style={{ color: '#64748b', marginTop: 8, fontSize: 16 }}>Return to the catalog to add SKUs.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4, paddingTop: 8 }}>
        <TouchableOpacity onPress={() => setCurrentScreen('Catalog')} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>Your cart</Text>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>{cartItems.length} items</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 240 }} showsVerticalScrollIndicator={false}>
        {cartItems.map(item => (
          <View key={item.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, flexDirection: 'row', borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', ...SHADOWS.sm }}>
            <View style={{ width: 4, backgroundColor: BRAND[800] }} />
            <View style={{ flex: 1, padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 2 }}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>{item.composition || item.company}</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '500', marginTop: 2 }}>{item.packing || '10 Tab'} · MRP {item.mrp || Math.round((item.price_ptr || item.price) * 1.2)}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteFromCart(item.id)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 10 }} onPress={() => removeFromCart(item.id)}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: BRAND[800] }}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ width: 36, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#1A1A1A', paddingVertical: 8 }}
                    keyboardType="numeric"
                    selectTextOnFocus
                    value={item.quantity.toString()}
                    onChangeText={(val) => {
                      if (val === '') setCartQuantity(item.id, 0);
                      else setCartQuantity(item.id, parseInt(val) || 1);
                    }}
                  />
                  <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 10 }} onPress={() => addToCart(item.id)}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: BRAND[800] }}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 17, fontWeight: '900', color: '#1A1A1A' }}>₹{(item.price * item.quantity).toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Bill Summary */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Bill Summary</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 15, color: '#64748b', fontWeight: '500' }}>Subtotal</Text>
            <Text style={{ fontSize: 15, color: '#1A1A1A', fontWeight: '700' }}>₹{subtotal.toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 15, color: '#64748b', fontWeight: '500' }}>GST (12%)</Text>
            <Text style={{ fontSize: 15, color: '#1A1A1A', fontWeight: '700' }}>₹{gst.toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, color: '#64748b', fontWeight: '500' }}>Delivery</Text>
            <Text style={{ fontSize: 15, color: BRAND[600], fontWeight: '700' }}>Free</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1A1A1A' }}>Total</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>₹{totalValue.toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA — positioned ABOVE tab bar */}
      <View style={{ position: 'absolute', bottom: 76, left: 0, right: 0, backgroundColor: '#fff', padding: 16, paddingBottom: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, ...SHADOWS.lg }}>
        {!isMinMet && (
          <View style={{ backgroundColor: '#FFF7ED', padding: 12, borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#FED7AA' }}>
            <Ionicons name="warning-outline" size={16} color="#EA580C" style={{ marginRight: 8 }} />
            <Text style={{ color: '#9A3412', fontSize: 13, fontWeight: '600', flex: 1 }}>
              Minimum order ₹{MIN_ORDER_VALUE.toLocaleString('en-IN')} required. Add ₹{amountNeeded.toLocaleString('en-IN')} more.
            </Text>
          </View>
        )}
        <AnimatedPressable
          style={[
            { paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
            isMinMet ? { backgroundColor: BRAND[800], ...SHADOWS.glowGreen } : { backgroundColor: '#E5E7EB' }
          ]}
          disabled={!isMinMet}
          onPress={() => { Haptics.selectionAsync(); setCurrentScreen('Review'); }}
        >
          <Text style={{ color: isMinMet ? '#fff' : '#9CA3AF', fontSize: 16, fontWeight: '800' }}>
            {isMinMet ? `Review order · ₹${totalValue.toLocaleString('en-IN')}` : `Add ₹${amountNeeded.toLocaleString('en-IN')} more`}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

// --- Review & Confirm Screen (Spec 14) ---
function ReviewConfirmScreen({ setCurrentScreen }) {
  const cart = useStore((state) => state.cart);
  const products = useStore((state) => state.products);
  const placeOrder = useStore((state) => state.placeOrder);
  const user = useStore((state) => state.user);
  const pastOrders = useStore((state) => state.orders);
  const [isPlacing, setIsPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);
  
  const schemes = useStore((s) => s.schemes);
  const appliedCoupon = useStore((s) => s.appliedCoupon);
  const setAppliedCoupon = useStore((s) => s.setAppliedCoupon);
  const getSchemesValidateUrl = useStore((s) => s.getSchemesValidateUrl);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const cartItems = Object.keys(cart).map(id => {
    const product = products.find(p => p.id === parseInt(id));
    return { ...product, quantity: cart[id] };
  }).filter(i => i.id);

  const subtotal = cartItems.reduce((acc, item) => acc + (item.price || 0) * item.quantity, 0);
  
  let discountValue = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_percent) {
      discountValue = subtotal * (appliedCoupon.discount_percent / 100);
      if (appliedCoupon.max_discount && discountValue > appliedCoupon.max_discount) {
        discountValue = appliedCoupon.max_discount;
      }
    } else if (appliedCoupon.flat_discount) {
      discountValue = appliedCoupon.flat_discount;
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - discountValue);
  const gst = Math.round(discountedSubtotal * 0.12 * 100) / 100;
  const totalValue = Math.round((discountedSubtotal + gst) * 100) / 100;
  const creditAvailable = (user.credit_limit || 0) - (user.credit_balance || 0);
  const hasEnoughCredit = creditAvailable >= totalValue;

  const handlePlaceOrder = async () => {
    Haptics.selectionAsync();
    if (!hasEnoughCredit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Credit Limit Exceeded", `You need ₹${totalValue.toLocaleString('en-IN')} but only have ₹${creditAvailable.toLocaleString('en-IN')} available. Please settle previous invoices.`);
      return;
    }

    setIsPlacing(true);
    const newOrder = {
      id: 'UPK-' + Math.floor(1000 + Math.random() * 9000),
      date: new Date().toLocaleDateString('en-GB'),
      store: user.store_name,
      phone: user.phone,
      items: cartItems,
      total: totalValue,
      subtotal: subtotal,
      discount_value: Math.round(discountValue),
      gst: gst,
      status: 'Placed',
      scheme_code: appliedCoupon ? appliedCoupon.code : null,
      created_at: new Date().toISOString(),
    };

    const success = await placeOrder(newOrder);
    setIsPlacing(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPlacedOrder(newOrder);
    }
  };

  // --- Order Success (Spec 15 — Enhanced with Invoice) ---
  if (placedOrder) {
    return (
      <View style={styles.centeredContainer}>
        <StatusBar barStyle="dark-content" />
        {/* Animated Success Circle */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: BRAND[100] }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', ...SHADOWS.glowGreen }}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </View>
          </View>
        </View>
        
        <Text style={{ fontSize: 30, fontWeight: '900', color: '#1A1A1A', marginBottom: 8, letterSpacing: -0.5 }}>Order placed!</Text>
        <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 28, paddingHorizontal: 24 }}>
          Your order has been received. Our team will{'\n'}review and accept it shortly.
        </Text>
        
        {/* Order Summary Card */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '90%', marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Order ID</Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#1A1A1A', marginTop: 2 }}>{placedOrder.id}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Amount</Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND[800], marginTop: 2 }}>₹{placedOrder.total.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>{placedOrder.items?.length || 0} items</Text>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>GST: ₹{(placedOrder.gst || 0).toLocaleString('en-IN')}</Text>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Credit: 60 days</Text>
          </View>
        </View>

        {/* Invoice Actions */}
        <View style={{ width: '90%', marginBottom: 16 }}>
          <TouchableOpacity 
            style={{ backgroundColor: BRAND[50], borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BRAND[100], marginBottom: 10 }}
            onPress={() => handleInvoiceGenerate(placedOrder, user)}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Ionicons name="document-text" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND[800] }}>Download GST Invoice</Text>
              <Text style={{ fontSize: 12, color: BRAND[600], fontWeight: '500', marginTop: 1 }}>PDF with full GST breakdown · Share via WhatsApp</Text>
            </View>
            <Ionicons name="download-outline" size={22} color={BRAND[800]} />
          </TouchableOpacity>
        </View>

        {/* Next Steps */}
        <View style={{ width: '90%', backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, marginBottom: 24 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>What happens next</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="checkmark-circle" size={14} color={BRAND[500]} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Admin reviews & accepts your order</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="cube-outline" size={14} color="#94a3b8" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>Order is packed & dispatched</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="notifications-outline" size={14} color="#94a3b8" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>You'll receive SMS updates at each stage</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12, width: '90%' }}>
          <TouchableOpacity style={{ flex: 1, borderWidth: 1.5, borderColor: BRAND[800], borderRadius: 16, paddingVertical: 16, alignItems: 'center' }} onPress={() => setCurrentScreen('Orders')}>
            <Text style={{ color: BRAND[800], fontWeight: '800', fontSize: 15 }}>Track order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, backgroundColor: BRAND[800], borderRadius: 16, paddingVertical: 16, alignItems: 'center', ...SHADOWS.glowGreen }} onPress={() => setCurrentScreen('Home')}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4, paddingTop: 8 }}>
        <TouchableOpacity onPress={() => setCurrentScreen('Cart')} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>Review & confirm</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 180 }} showsVerticalScrollIndicator={false}>
        {/* Delivery Address */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Delivery address</Text>
        <TouchableOpacity onPress={() => setCurrentScreen('Profile')} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' }}>
          <Ionicons name="location-outline" size={20} color={BRAND[800]} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1A1A' }}>{user.store_name}</Text>
            <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500', marginTop: 2 }}>{user.address || 'No address set — tap to add in Profile'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
        </TouchableOpacity>

        {/* Items Summary */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Items ({cartItems.length})</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9' }}>
          {cartItems.map((item, idx) => (
            <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: idx < cartItems.length - 1 ? 1 : 0, borderBottomColor: '#f1f5f9' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>x{item.quantity} · ₹{item.price}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A' }}>₹{(item.price * item.quantity).toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>

        {/* Apply Coupon */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Offers & Schemes</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
          {appliedCoupon ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BRAND[50], padding: 12, borderRadius: 12, borderWidth: 1, borderColor: BRAND[100] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="pricetag" size={20} color={BRAND[600]} style={{ marginRight: 8 }} />
                <View>
                  <Text style={{ color: BRAND[800], fontWeight: '800', fontSize: 14 }}>{appliedCoupon.code} applied</Text>
                  <Text style={{ color: BRAND[600], fontSize: 12, fontWeight: '600' }}>You saved ₹{Math.round(discountValue).toLocaleString('en-IN')}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setAppliedCoupon(null); }}>
                <Text style={{ color: '#dc2626', fontWeight: '800', fontSize: 13 }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', color: '#1A1A1A', fontWeight: '700', fontSize: 15 }}
                  placeholder="Enter scheme code"
                  placeholderTextColor="#94a3b8"
                  value={couponInput}
                  onChangeText={(t) => { setCouponInput(t.toUpperCase()); setCouponError(''); }}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={{ backgroundColor: couponInput.trim() && !isApplyingCoupon ? BRAND[800] : '#e2e8f0', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, marginLeft: 12 }}
                  disabled={!couponInput.trim() || isApplyingCoupon}
                  onPress={async () => {
                    Haptics.selectionAsync();
                    const code = couponInput.trim();
                    if (!code) return;
                    
                    setIsApplyingCoupon(true);
                    setCouponError('');
                    
                    try {
                      const res = await fetch(getSchemesValidateUrl(), {
                        method: 'POST',
                        headers: useStore.getState().authHeaders(),
                        body: JSON.stringify({
                          code: code,
                          order_subtotal: subtotal
                        })
                      });
                      
                      const data = await res.json();
                      if (data.success && data.scheme) {
                        setAppliedCoupon(data.scheme);
                        setCouponInput('');
                      } else {
                        setCouponError(data.error || 'Invalid or inactive scheme code.');
                      }
                    } catch (err) {
                      setCouponError('Network error while validating coupon.');
                    } finally {
                      setIsApplyingCoupon(false);
                    }
                  }}
                >
                  <Text style={{ color: couponInput.trim() && !isApplyingCoupon ? '#fff' : '#94a3b8', fontWeight: '800', fontSize: 14 }}>
                    {isApplyingCoupon ? 'Wait..' : 'Apply'}
                  </Text>
                </TouchableOpacity>
              </View>
              {couponError ? <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '600', marginTop: 8, marginLeft: 4 }}>{couponError}</Text> : null}
            </View>
          )}
        </View>

        {/* Bill Summary */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bill summary</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '500' }}>Subtotal</Text>
            <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '700' }}>₹{subtotal.toLocaleString('en-IN')}</Text>
          </View>
          {discountValue > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 14, color: BRAND[600], fontWeight: '700' }}>Discount ({appliedCoupon?.code})</Text>
              <Text style={{ fontSize: 14, color: BRAND[600], fontWeight: '800' }}>- ₹{Math.round(discountValue).toLocaleString('en-IN')}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '500' }}>GST (12%)</Text>
            <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '700' }}>₹{gst.toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '500' }}>Delivery</Text>
            <Text style={{ fontSize: 14, color: BRAND[600], fontWeight: '700' }}>Free</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1A1A1A' }}>Total</Text>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#1A1A1A' }}>₹{totalValue.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Payment Method */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment method</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="card-outline" size={18} color={BRAND[800]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1A1A' }}>UPKEM Credit Line</Text>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>60-day payment terms</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={BRAND[500]} />
          </View>
          <View style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Available credit</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: hasEnoughCredit ? BRAND[700] : '#dc2626' }}>₹{creditAvailable.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Place Order CTA */}
      <View style={{ position: 'absolute', bottom: 76, left: 0, right: 0, backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, ...SHADOWS.lg }}>
        <AnimatedPressable
          style={[
            { paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
            hasEnoughCredit ? { backgroundColor: BRAND[800], ...SHADOWS.glowGreen } : { backgroundColor: '#E5E7EB' }
          ]}
          disabled={!hasEnoughCredit || isPlacing}
          onPress={handlePlaceOrder}
        >
          <Text style={{ color: hasEnoughCredit ? '#fff' : '#9CA3AF', fontSize: 16, fontWeight: '800' }}>
            {isPlacing ? 'Placing order...' : hasEnoughCredit ? `Place order · ₹${totalValue.toLocaleString('en-IN')}` : 'Insufficient credit'}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

// --- Order Tracking Screen (Spec 16) ---
function OrderTrackingScreen({ setCurrentScreen, order }) {
  if (!order) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={{ color: '#64748b', fontSize: 16 }}>Order not found.</Text>
      </View>
    );
  }

  const TIMELINE_STEPS = [
    { key: 'Placed', label: 'Order placed', icon: 'receipt-outline', desc: 'Your order has been received' },
    { key: 'Accepted', label: 'Accepted', icon: 'checkmark-circle-outline', desc: 'Order confirmed by UPKEM team' },
    { key: 'Processing', label: 'Processing', icon: 'cube-outline', desc: 'Order is being packed' },
    { key: 'Shipped', label: 'Shipped', icon: 'car-outline', desc: order.courier_name ? `Via ${order.courier_name}` : 'Dispatched for delivery' },
    { key: 'Delivered', label: 'Delivered', icon: 'home-outline', desc: 'Order delivered successfully' },
  ];

  const statusOrder = ['Placed', 'Accepted', 'Processing', 'Shipped', 'Delivered'];
  const currentIdx = statusOrder.indexOf(order.status);
  const isRejected = order.status === 'Rejected';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8 }}>
        <TouchableOpacity onPress={() => setCurrentScreen('Orders')} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>{order.id}</Text>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>{order.date} · ₹{order.total?.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        {isRejected ? (
          <View style={{ backgroundColor: '#fee2e2', borderRadius: 16, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="close-circle" size={24} color="#dc2626" style={{ marginRight: 12 }} />
            <View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#dc2626' }}>Order Rejected</Text>
              <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '500' }}>Credit has been refunded to your account.</Text>
            </View>
          </View>
        ) : (
          <View style={{ backgroundColor: BRAND[50], borderRadius: 16, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Ionicons name={TIMELINE_STEPS[currentIdx]?.icon || 'time-outline'} size={20} color="#fff" />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND[800] }}>{order.status}</Text>
              <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>{TIMELINE_STEPS[currentIdx]?.desc}</Text>
            </View>
          </View>
        )}

        {/* Timeline */}
        {!isRejected && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Timeline</Text>
            {TIMELINE_STEPS.map((step, idx) => {
              const isCompleted = idx <= currentIdx;
              const isCurrent = idx === currentIdx;
              const isLast = idx === TIMELINE_STEPS.length - 1;
              return (
                <View key={step.key} style={{ flexDirection: 'row', minHeight: 60 }}>
                  {/* Dot + Line */}
                  <View style={{ alignItems: 'center', width: 32 }}>
                    <View style={{
                      width: isCurrent ? 28 : 20, height: isCurrent ? 28 : 20, borderRadius: 14,
                      backgroundColor: isCompleted ? BRAND[800] : '#e2e8f0',
                      justifyContent: 'center', alignItems: 'center',
                      borderWidth: isCurrent ? 3 : 0, borderColor: BRAND[100],
                    }}>
                      {isCompleted && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    {!isLast && (
                      <View style={{ width: 2, flex: 1, backgroundColor: isCompleted && idx < currentIdx ? BRAND[800] : '#e2e8f0', marginVertical: 2 }} />
                    )}
                  </View>
                  {/* Label */}
                  <View style={{ flex: 1, paddingLeft: 12, paddingBottom: 20 }}>
                    <Text style={{ fontSize: 15, fontWeight: isCompleted ? '800' : '600', color: isCompleted ? '#1A1A1A' : '#94a3b8' }}>{step.label}</Text>
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500', marginTop: 2 }}>{step.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Courier Info */}
        {order.status === 'Shipped' && order.courier_name && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Courier details</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A' }}>{order.courier_name}</Text>
            {order.tracking_id && <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND[700], marginTop: 4 }}>Tracking: {order.tracking_id}</Text>}
          </View>
        )}

        {/* Order Items */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Items</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
          {order.items?.map((item, idx) => (
            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: idx < order.items.length - 1 ? 1 : 0, borderBottomColor: '#f1f5f9' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8' }}>x{item.quantity} · ₹{item.price}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>₹{(item.price * item.quantity).toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}


// --- Order History Screen (Spec 17) ---
function OrderHistoryScreen({ setCurrentScreen, onSelectOrder }) {
  const orders = useStore((state) => state.orders);
  const [activeFilter, setActiveFilter] = useState('All');
  const filters = ['All', 'Active', 'Completed', 'Cancelled'];

  const getStatusColor = (status) => {
    switch(status) {
      case 'Shipped': return { bg: '#ecfdf5', text: '#059669' };
      case 'Completed': case 'Delivered': return { bg: '#ecfdf5', text: '#059669' };
      case 'Rejected': case 'Cancelled': return { bg: '#fee2e2', text: '#dc2626' };
      case 'Processing': return { bg: '#FFF7ED', text: '#EA580C' };
      default: return { bg: '#f1f5f9', text: '#475569' };
    }
  };

  const filteredOrders = orders.filter(o => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Active') return ['Placed', 'Processing', 'Shipped'].includes(o.status);
    if (activeFilter === 'Completed') return ['Completed', 'Delivered'].includes(o.status);
    if (activeFilter === 'Cancelled') return ['Rejected', 'Cancelled'].includes(o.status);
    return true;
  });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4, paddingTop: 8 }}>
        <TouchableOpacity onPress={() => setCurrentScreen('Home')} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>Orders</Text>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>{orders.length} placed · last 30 days</Text>
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => { Haptics.selectionAsync(); setActiveFilter(f); }}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              backgroundColor: activeFilter === f ? BRAND[800] : '#fff',
              borderWidth: 1, borderColor: activeFilter === f ? BRAND[800] : '#e2e8f0',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: activeFilter === f ? '#fff' : '#475569' }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        data={filteredOrders}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => {
          const sc = getStatusColor(item.status);
          return (
            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onSelectOrder && onSelectOrder(item); }} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#1A1A1A' }}>{item.id}</Text>
                <View style={{ backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: sc.text, textTransform: 'uppercase' }}>{item.status}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: '#94a3b8', fontWeight: '500', marginBottom: 12 }}>
                {item.date} · {item.items?.length || 0} items
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>Total</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#1A1A1A' }}>₹{item.total?.toLocaleString('en-IN')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND[700], marginRight: 4 }}>Track order</Text>
                <Ionicons name="chevron-forward" size={14} color={BRAND[700]} />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="receipt-outline" size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
            <Text style={{ color: '#64748b', fontSize: 16, fontWeight: '500' }}>No orders found.</Text>
          </View>
        }
      />
    </View>
  );
}

// --- Profile Screen (Spec 18) ---
function ProfileScreen({ setCurrentScreen }) {
  const user = useStore((state) => state.user);
  const orders = useStore((state) => state.orders);
  const setUser = useStore((state) => state.setUser);
  const clearCart = useStore((state) => state.clearCart);

  const handleLogout = () => {
    Haptics.selectionAsync();
    Alert.alert("Confirm Logout", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => {
        setUser(null);
        clearCart();
        useStore.getState().clearCoupon();
        useStore.getState().setSessionId(null);
        setCurrentScreen('Login');
      }}
    ]);
  };

  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = () => {
    Haptics.selectionAsync();
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account, all orders, and personal data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const res = await fetch(useStore.getState().getDeleteAccountUrl(), {
                method: 'DELETE',
                headers: useStore.getState().authHeaders(),
              });
              if (res.ok) {
                setUser(null);
                clearCart();
                useStore.getState().clearCoupon();
                useStore.getState().setSessionId(null);
                setCurrentScreen('Login');
                Alert.alert('Account deleted', 'Your data has been permanently removed.');
              } else {
                const d = await res.json();
                Alert.alert('Error', d.error || 'Failed to delete account. Please try again.');
              }
            } catch {
              Alert.alert('Error', 'Network error. Please try again.');
            }
            setDeletingAccount(false);
          },
        },
      ]
    );
  };

  const creditUtilization = ((user.credit_balance || 0) / (user.credit_limit || 1)) * 100;
  const creditColor = creditUtilization > 90 ? '#ef4444' : creditUtilization > 60 ? '#f59e0b' : BRAND[600];

  const pendingDues = user.credit_balance || 0;
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressInput, setAddressInput] = useState(user.address || '');
  const [savingAddress, setSavingAddress] = useState(false);

  const handleSaveAddress = async () => {
    setSavingAddress(true);
    try {
      const url = useStore.getState().getApiUrl();
      await fetch(url, {
        method: 'POST',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ action: 'update_address', address: addressInput }),
      });
      setUser({ ...user, address: addressInput });
      setShowAddressModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Failed to save address.');
    }
    setSavingAddress(false);
  };

  // Build info rows for business details
  const businessDetails = [
    { label: 'Drug License No.', value: user.drug_license, icon: 'document-text-outline' },
    { label: 'GST Number', value: user.gst_number, icon: 'receipt-outline' },
    { label: 'Registration No.', value: user.registration_number, icon: 'shield-checkmark-outline' },
    { label: 'Email', value: user.email, icon: 'mail-outline' },
    { label: 'User Type', value: user.user_type, icon: 'people-outline' },
    { label: 'District', value: user.city, icon: 'map-outline' },
    { label: 'Zone / State', value: user.zone, icon: 'globe-outline' },
  ].filter(d => d.value);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8 }}>
        <TouchableOpacity onPress={() => setCurrentScreen('Home')} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={{ backgroundColor: BRAND[800], borderRadius: 20, padding: 20, marginBottom: 24, ...SHADOWS.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: BRAND[700], justifyContent: 'center', alignItems: 'center', marginRight: 14, borderWidth: 1.5, borderColor: BRAND[500] }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>{user.store_name?.[0]}{user.store_name?.split(' ')[1]?.[0] || ''}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 }}>{user.store_name}</Text>
              <Text style={{ color: BRAND[100], fontSize: 13, fontWeight: '500', marginTop: 2 }}>+91 {user.phone}</Text>
              {user.email ? <Text style={{ color: BRAND[100], fontSize: 12, fontWeight: '500', marginTop: 1 }}>{user.email}</Text> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {user.is_approved ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(45,158,80,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <Ionicons name="checkmark-circle" size={14} color={BRAND[500]} />
                <Text style={{ color: BRAND[100], fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>Verified</Text>
              </View>
            ) : null}
            {user.user_type ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{user.user_type}</Text>
              </View>
            ) : null}
            {user.city ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{user.city}{user.zone ? `, ${user.zone}` : ''}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Business & Compliance Details */}
        {businessDetails.length > 0 && (
          <>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Business & Compliance</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#f1f5f9' }}>
              {businessDetails.map((item, idx) => (
                <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: idx < businessDetails.length - 1 ? 1 : 0, borderBottomColor: '#f1f5f9' }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Ionicons name={item.icon} size={17} color={BRAND[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginTop: 2 }}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Delivery Address */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Delivery Address</Text>
        <TouchableOpacity onPress={() => { setAddressInput(user.address || ''); setShowAddressModal(true); }} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, padding: 16, borderWidth: 1, borderColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
            <Ionicons name="location-outline" size={17} color={BRAND[700]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A1A1A' }}>{user.address || 'No address set'}</Text>
            {!user.address && <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500', marginTop: 2 }}>Tap to add your delivery address</Text>}
          </View>
          <Ionicons name="create-outline" size={18} color={BRAND[600]} />
        </TouchableOpacity>

        {/* Activity Section */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Activity</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#f1f5f9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' }}>Orders</Text>
            <Text style={{ fontSize: 14, color: '#94a3b8', fontWeight: '700' }}>{orders.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' }}>Invoices</Text>
            <Text style={{ fontSize: 14, color: '#94a3b8', fontWeight: '700' }}>{orders.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' }}>Pending dues</Text>
            <Text style={{ fontSize: 14, color: pendingDues > 0 ? '#EA580C' : '#94a3b8', fontWeight: '700' }}>₹{pendingDues.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Credit Summary — Enhanced */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Credit</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '500' }}>Credit Limit</Text>
            <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '700' }}>₹{(user.credit_limit || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '500' }}>Used</Text>
            <Text style={{ fontSize: 14, color: '#EA580C', fontWeight: '700' }}>₹{(user.credit_balance || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '500' }}>Available</Text>
            <Text style={{ fontSize: 14, color: BRAND[700], fontWeight: '800' }}>₹{((user.credit_limit || 0) - (user.credit_balance || 0)).toLocaleString('en-IN')}</Text>
          </View>
          <View style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, marginTop: 14, overflow: 'hidden' }}>
            <View style={{ height: 8, backgroundColor: creditColor, borderRadius: 4, width: `${Math.min(creditUtilization, 100)}%` }} />
          </View>
          <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 6, textAlign: 'right' }}>{Math.round(creditUtilization)}% utilized · 60 day terms</Text>
        </View>

        {/* Removed Make Payment / Bank Details from Profile as per Spec */}
        {/* Invoices List */}
        {orders.length > 0 && (
          <>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Invoices</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#f1f5f9' }}>
              {orders.slice(0, 5).map((order, idx) => (
                <TouchableOpacity
                  key={order.id}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: idx < Math.min(orders.length, 5) - 1 ? 1 : 0, borderBottomColor: '#f1f5f9' }}
                  onPress={() => handleInvoiceGenerate(order, user)}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Ionicons name="document-text-outline" size={17} color={BRAND[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>{order.id}</Text>
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>{order.date} · ₹{order.total?.toLocaleString('en-IN')}</Text>
                  </View>
                  <Ionicons name="download-outline" size={18} color={BRAND[600]} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Quick Actions */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Quick Actions</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          <TouchableOpacity onPress={() => setCurrentScreen('Orders')} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' }}>
            <Ionicons name="receipt-outline" size={22} color={BRAND[700]} style={{ marginBottom: 6 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>Order History</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); Alert.alert('Support', 'Call: ' + COMPANY.mobile + '\nEmail: ' + COMPANY.email); }} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' }}>
            <Ionicons name="call-outline" size={22} color={BRAND[700]} style={{ marginBottom: 6 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>Contact Rep</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity onPress={handleLogout} style={{ paddingVertical: 16, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#dc2626', fontWeight: '800', fontSize: 15 }}>Sign out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
          style={{ paddingVertical: 12, alignItems: 'center', marginBottom: 8 }}
        >
          <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 13 }}>
            {deletingAccount ? 'Deleting…' : 'Delete account'}
          </Text>
        </TouchableOpacity>

        {/* App Info */}
        <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 10, color: '#cbd5e1', fontWeight: '600' }}>v{APP_VERSION} · {COMPANY.brand}</Text>
          <Text style={{ fontSize: 10, color: '#e2e8f0', fontWeight: '500', marginTop: 2 }}>GSTIN: {COMPANY.gstin}</Text>
        </View>
      </ScrollView>

      {/* Address Modal */}
      <Modal visible={showAddressModal} transparent animationType="slide">
        <View style={styles.modalOverlayBottom}>
          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>Delivery Address</Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>This address will be used for all deliveries.</Text>
            <TextInput
              style={[styles.inputFieldConfig, { height: 100, textAlignVertical: 'top', marginBottom: 20 }]}
              multiline
              placeholder="Enter your full delivery address..."
              value={addressInput}
              onChangeText={setAddressInput}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setShowAddressModal(false)}>
                <Text style={{ fontWeight: '800', color: '#64748b', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <AnimatedPressable style={styles.btnSave} onPress={handleSaveAddress} disabled={savingAddress}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{savingAddress ? 'Saving...' : 'Save address'}</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- App Root ---
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [catalogInitialCategory, setCatalogInitialCategory] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const fetchAPI = async () => {
    // The data feed is private; skip polling until the user has a session.
    if (!useStore.getState().sessionId) return;
    try {
      const url = useStore.getState().getApiUrl();
      const res = await fetch(url, { headers: useStore.getState().authHeaders() });
      if (!res.ok) throw new Error('API Not OK');
      const db = await res.json();
      
      // Cache success to AsyncStorage
      await AsyncStorage.setItem('@upkem_cached_db', JSON.stringify(db));
      
      useStore.getState().setProducts(db.products || []);
      useStore.getState().setUsersList(db.users || []);
      useStore.getState().setSchemes(db.schemes || []);
      setIsOfflineMode(false);
      
      const currUser = useStore.getState().user;
      if (currUser) {
        const userOrders = db.orders.filter(o => o.phone === currUser.phone || o.store === currUser.store_name || o.user_phone === currUser.phone || o.store_name === currUser.store_name);
        useStore.getState().setOrders(userOrders);
        const liveUser = db.users.find(u => u.phone === currUser.phone);
        if (liveUser && JSON.stringify(liveUser) !== JSON.stringify(currUser)) {
          useStore.getState().setUser(liveUser);
        }
        // Also update selectedOrder with live data if tracking
        if (selectedOrder) {
          const liveOrder = userOrders.find(o => o.id === selectedOrder.id);
          if (liveOrder) setSelectedOrder(liveOrder);
        }
      }
    } catch (e) {
      // Offline fallback
      try {
        const cachedData = await AsyncStorage.getItem('@upkem_cached_db');
        if (cachedData) {
          const db = JSON.parse(cachedData);
          useStore.getState().setProducts(db.products || []);
          useStore.getState().setUsersList(db.users || []);
          setIsOfflineMode(true);
        }
      } catch (err) {
        console.error("Cache read error", err);
      }
    }
  };

  useEffect(() => {
    fetchAPI();
    const interval = setInterval(fetchAPI, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const renderScreen = () => {
    if (currentScreen === 'Login') return <LoginScreen setCurrentScreen={setCurrentScreen} />;
    if (currentScreen === 'Signup') return <SignupScreen setCurrentScreen={setCurrentScreen} />;
    if (currentScreen === 'PendingApproval') return <PendingApprovalScreen setCurrentScreen={setCurrentScreen} />;
    return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8' }}>
        <View style={{ flex: 1, paddingTop: Constants.statusBarHeight || 48 }}>
          {isOfflineMode && (
            <View style={{ backgroundColor: '#fef3c7', padding: 8, alignItems: 'center' }}>
              <Text style={{ color: '#d97706', fontSize: 12, fontWeight: '800' }}><Ionicons name="cloud-offline-outline" size={12} color="#d97706" /> OFFLINE MODE - Showing Cached Catalog</Text>
            </View>
          )}
          {currentScreen === 'Home' && (
            <HomeScreen
              setCurrentScreen={setCurrentScreen}
              onCategorySelect={setCatalogInitialCategory}
              onRefresh={fetchAPI}
            />
          )}
          {currentScreen === 'Catalog' && (
            <CatalogScreen
              setCurrentScreen={setCurrentScreen}
              initialCategory={catalogInitialCategory}
            />
          )}
          {currentScreen === 'Cart' && <CartScreen setCurrentScreen={setCurrentScreen} />}
          {currentScreen === 'Review' && <ReviewConfirmScreen setCurrentScreen={setCurrentScreen} />}
          {currentScreen === 'Orders' && <OrderHistoryScreen setCurrentScreen={setCurrentScreen} onSelectOrder={(order) => { setSelectedOrder(order); setCurrentScreen('Tracking'); }} />}
          {currentScreen === 'Tracking' && <OrderTrackingScreen setCurrentScreen={setCurrentScreen} order={selectedOrder} />}
          {currentScreen === 'Profile' && <ProfileScreen setCurrentScreen={setCurrentScreen} />}
        </View>
        <View style={[styles.tabBar, SHADOWS.lg]}>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Haptics.selectionAsync(); setCurrentScreen('Home'); }}>
            <Ionicons name={currentScreen === 'Home' ? 'home' : 'home-outline'} size={22} color={currentScreen === 'Home' ? BRAND[800] : '#94a3b8'} />
            {currentScreen === 'Home' && <View style={styles.tabDot} />}
            <Text style={[styles.tabText, currentScreen === 'Home' && styles.tabTextActive]}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Haptics.selectionAsync(); setCatalogInitialCategory('All'); setCurrentScreen('Catalog'); }}>
            <Ionicons name={currentScreen === 'Catalog' ? 'search' : 'search-outline'} size={22} color={currentScreen === 'Catalog' ? BRAND[800] : '#94a3b8'} />
            {currentScreen === 'Catalog' && <View style={styles.tabDot} />}
            <Text style={[styles.tabText, currentScreen === 'Catalog' && styles.tabTextActive]}>Browse</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Haptics.selectionAsync(); setCurrentScreen('Orders'); }}>
            <Ionicons name={currentScreen === 'Orders' ? 'document-text' : 'document-text-outline'} size={22} color={currentScreen === 'Orders' ? BRAND[800] : '#94a3b8'} />
            {currentScreen === 'Orders' && <View style={styles.tabDot} />}
            <Text style={[styles.tabText, currentScreen === 'Orders' && styles.tabTextActive]}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => { Haptics.selectionAsync(); setCurrentScreen('Profile'); }}>
            <Ionicons name={currentScreen === 'Profile' ? 'person' : 'person-outline'} size={22} color={currentScreen === 'Profile' ? BRAND[800] : '#94a3b8'} />
            {currentScreen === 'Profile' && <View style={styles.tabDot} />}
            <Text style={[styles.tabText, currentScreen === 'Profile' && styles.tabTextActive]}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return <View style={{ flex: 1 }}>{renderScreen()}</View>;
}

// --- High-End Styles ---
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAF8' },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7FAF8', padding: 24 },
  pageTitle: { fontSize: 32, fontWeight: '900', color: '#1A1A1A', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, letterSpacing: -1 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#64748b', fontSize: 16, fontWeight: '500' },
  
  // Login
  loginContainer: { flex: 1, backgroundColor: '#0B2618' },
  loginHero: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingTop: 60 },
  logoContainer: { padding: 4, backgroundColor: '#fff', borderRadius: 28, marginBottom: 24, ...SHADOWS.glowGreen },
  loginLogo: { width: 90, height: 90, borderRadius: 24 },
  companyName: { color: '#ffffff', fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: '#64748b', fontSize: 16, marginTop: 8, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase' },
  loginCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 32, paddingBottom: 60, ...SHADOWS.lg },
  dragHandle: { width: 40, height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, alignSelf: 'center', marginBottom: 32 },
  loginTitle: { fontSize: 32, fontWeight: '900', color: '#1A1A1A', marginBottom: 8, letterSpacing: -1 },
  loginSubtitle: { fontSize: 16, color: '#64748b', marginBottom: 40, fontWeight: '500' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 20, marginBottom: 24, backgroundColor: '#f8fafc' },
  inputPrefix: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  inputDivider: { width: 1.5, height: 24, backgroundColor: '#e2e8f0', marginHorizontal: 16 },
  inputField: { flex: 1, paddingVertical: 20, fontSize: 18, color: '#1A1A1A', fontWeight: '700', letterSpacing: 1 },
  buttonPrimary: { backgroundColor: BRAND[800], paddingVertical: 20, borderRadius: 20, alignItems: 'center', ...SHADOWS.glowGreen },
  buttonPrimaryText: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  configText: { color: '#64748b', textAlign: 'center', fontWeight: '700', fontSize: 13, letterSpacing: 1 },

  // Modals & Bottom Sheets
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.7)', justifyContent: 'center', padding: 24 },
  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 32, padding: 32, ...SHADOWS.lg },
  bottomSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, maxHeight: '80%', ...SHADOWS.lg },
  modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 8, color: '#0f172a', letterSpacing: -0.5 },
  inputFieldConfig: { borderWidth: 1.5, borderColor: '#e2e8f0', padding: 20, borderRadius: 16, fontSize: 16, backgroundColor: '#f8fafc', color: '#1A1A1A', fontWeight: '600' },
  btnCancel: { padding: 18, borderRadius: 16, backgroundColor: '#f1f5f9', flex: 1, alignItems: 'center' },
  btnSave: { padding: 18, borderRadius: 16, backgroundColor: BRAND[800], flex: 1, alignItems: 'center', ...SHADOWS.md },
  companyRow: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, backgroundColor: '#f8fafc' },
  companyRowActive: { backgroundColor: BRAND[100], borderColor: BRAND[800], borderWidth: 1 },
  companyRowText: { fontSize: 16, fontWeight: '600', color: '#475569' },
  companyRowTextActive: { color: BRAND[800], fontWeight: '800' },

  // Pending
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  iconCircleLg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  pendingCard: { backgroundColor: '#ffffff', padding: 40, borderRadius: 32, alignItems: 'center', ...SHADOWS.md, width: '100%' },
  pendingTitle: { fontSize: 28, fontWeight: '900', color: '#1A1A1A', textAlign: 'center', marginBottom: 16, letterSpacing: -1 },
  pendingDesc: { fontSize: 16, color: '#64748b', textAlign: 'center', lineHeight: 24, fontWeight: '500' },

  // Catalog Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 },
  headerCredit: { fontSize: 14, color: '#059669', fontWeight: '700', marginTop: 4 },
  headerLogo: { width: 48, height: 48, borderRadius: 16, ...SHADOWS.sm },
  
  // Search & Categories (MedPlus Style)
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: '#ffffff', padding: 18, paddingLeft: 48, borderRadius: 20, fontSize: 16, borderWidth: 1, borderColor: '#f1f5f9', color: '#1A1A1A', fontWeight: '600', ...SHADOWS.sm },
  filterIconBtn: { width: 60, height: 60, backgroundColor: '#ffffff', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 12, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm },
  filterBadge: { position: 'absolute', top: 14, right: 14, width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND[800], borderWidth: 2, borderColor: '#ffffff' },
  filterTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  
  categoryPill: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, backgroundColor: '#ffffff', marginRight: 12, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm },
  categoryPillActive: { backgroundColor: BRAND[800], borderColor: BRAND[800] },
  categoryText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  categoryTextActive: { color: '#ffffff' },

  systemPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f1f5f9', marginRight: 8 },
  systemPillActive: { backgroundColor: BRAND[100] },
  systemText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  systemTextActive: { color: BRAND[800], fontWeight: '700' },
  
  // Products
  productCard: { backgroundColor: '#ffffff', padding: 20, borderRadius: 24, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm },
  productInfo: { flex: 1, paddingRight: 16 },
  productName: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 6, letterSpacing: -0.3 },
  productDesc: { fontSize: 13, color: '#64748b', marginBottom: 12, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productPrice: { fontSize: 20, fontWeight: '900', color: '#1A1A1A' },
  stockBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  stockText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  
  cartAction: { alignItems: 'center' },
  addBtn: { backgroundColor: '#f8fafc', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  addBtnText: { color: BRAND[800], fontWeight: '900', fontSize: 14 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  qtyBtn: { padding: 12, paddingHorizontal: 16 },
  qtyBtnText: { fontSize: 18, fontWeight: '800', color: BRAND[800] },
  qtyInput: { width: 40, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#1A1A1A' },

  // Smart Cart Tracker
  smartCartTracker: { position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: BRAND[800], borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smartCartTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  smartCartProgressBg: { height: 6, backgroundColor: BRAND[700], borderRadius: 3, overflow: 'hidden' },
  smartCartProgressFill: { height: '100%', borderRadius: 3 },
  smartCartBtn: { width: 56, height: 56, borderRadius: 20, backgroundColor: BRAND[700], justifyContent: 'center', alignItems: 'center' },


  // Cart Screen
  cartItemCard: { backgroundColor: '#ffffff', padding: 20, borderRadius: 24, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm },
  cartItemQtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  checkoutFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, ...SHADOWS.lg },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  billLabel: { fontSize: 16, color: '#64748b', fontWeight: '600' },
  billTotal: { fontSize: 28, fontWeight: '900', color: '#1A1A1A', letterSpacing: -1 },
  minOrderAlert: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' },
  minOrderAlertText: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
  checkoutBtn: { backgroundColor: BRAND[800], paddingVertical: 20, borderRadius: 20, alignItems: 'center' },
  checkoutBtnDisabled: { backgroundColor: '#cbd5e1', opacity: 0.7 },
  checkoutBtnText: { color: '#ffffff', fontSize: 18, fontWeight: '800' },

  // Profile
  profileHeader: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  profileName: { fontSize: 24, fontWeight: '900', color: '#1A1A1A', marginBottom: 4, letterSpacing: -0.5 },
  profilePhone: { fontSize: 16, color: '#64748b', fontWeight: '600' },
  logoutBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  logoutBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 13 },
  
  creditCard: { backgroundColor: BRAND[800], padding: 24, borderRadius: 32, marginBottom: 40 },
  creditTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 20 },
  creditStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  creditLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  creditValue: { color: '#ffffff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  progressBar: { height: 8, backgroundColor: BRAND[700], borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginBottom: 20, letterSpacing: -0.5 },
  orderCard: { backgroundColor: '#ffffff', padding: 24, borderRadius: 24, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' },
  orderId: { fontWeight: '900', color: '#1A1A1A', fontSize: 16 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusText: { fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  orderDate: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  orderTotal: { color: '#1A1A1A', fontSize: 18, fontWeight: '900' },
  invoiceBtn: { backgroundColor: BRAND[50], padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: BRAND[100] },
  invoiceBtnText: { color: BRAND[800], fontWeight: '800', fontSize: 14 },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#ffffff', paddingBottom: Platform.OS === 'ios' ? 32 : 20, paddingTop: 16, position: 'absolute', bottom: 0, left: 0, right: 0 },
  tabItem: { flex: 1, alignItems: 'center', position: 'relative' },
  tabText: { color: '#94a3b8', fontWeight: '700', fontSize: 12, marginTop: 4 },
  tabTextActive: { color: BRAND[800], fontWeight: '900' },
  tabDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: BRAND[500], marginTop: 3 },
  cartBadge: { position: 'absolute', top: -4, right: -8, width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: 6, borderWidth: 2, borderColor: '#fff' },

  // Home Screen
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 },
  homeGreeting: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  homeStoreName: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 },
  homeSearchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', marginHorizontal: 16, marginBottom: 16, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', ...SHADOWS.sm },
  homeSearchPlaceholder: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#ffffff', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', ...SHADOWS.sm },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 },
  statSub: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  homeCategoryCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  promoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND[800], marginHorizontal: 16, marginBottom: 24, padding: 24, borderRadius: 24, ...SHADOWS.md },
  promoBannerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900', marginBottom: 6, letterSpacing: -0.3 },
  promoBannerSub: { color: '#94a3b8', fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 16 },
  promoBannerBtn: { backgroundColor: BRAND[800], paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14, alignSelf: 'flex-start' },
  promoBannerBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  homeSectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  homeSectionTitle: { fontSize: 20, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.3 },
  seeAllText: { color: BRAND[700], fontWeight: '700', fontSize: 14 },
  homeCategoryGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 8 },
  homeCategoryItem: { width: '18%', margin: '1%', aspectRatio: 0.85, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 8 },
  homeCategoryIcon: { fontSize: 28, marginBottom: 6 },
  homeCategoryText: { fontSize: 11, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  featuredCard: { backgroundColor: '#ffffff', width: 148, marginRight: 12, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm },
  featuredCardImage: { width: '100%', height: 110, backgroundColor: '#f1f5f9' },
  featuredCardName: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', margin: 10, marginBottom: 2, lineHeight: 18 },
  featuredCardCompany: { fontSize: 11, color: '#64748b', fontWeight: '600', marginHorizontal: 10, marginBottom: 4 },
  featuredCardPrice: { fontSize: 15, fontWeight: '900', color: BRAND[800], margin: 10, marginTop: 2, marginBottom: 12 },

  // Catalog search + filter
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 0, gap: 10 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 18, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', ...SHADOWS.sm },
  filterBtnActive: { backgroundColor: BRAND[800], borderColor: BRAND[800] },
  filterBtnText: { fontWeight: '800', fontSize: 14, color: '#475569' },
  filterCountBadge: { backgroundColor: '#ef4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', position: 'absolute', top: -6, right: -6 },
  filterCountText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  activeChip: { backgroundColor: BRAND[100], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: BRAND[500] },
  activeChipText: { color: BRAND[800], fontWeight: '700', fontSize: 12 },
  clearChip: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  clearChipText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  // Product card with thumbnail
  productThumb: { width: 72, height: 72, borderRadius: 16, marginRight: 14, backgroundColor: '#f1f5f9' },

  // Product detail modal
  detailImage: { width: '100%', height: 200, borderRadius: 20, marginBottom: 20, backgroundColor: '#f1f5f9' },
  detailInfoBox: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 12 },
  detailInfoLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  detailInfoValue: { fontSize: 15, color: '#0f172a', fontWeight: '600', lineHeight: 22 },

  // Filter panel
  filterPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  clearAllText: { color: '#ef4444', fontWeight: '800', fontSize: 14 },
  filterSectionTitle: { fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 12 },
  filterRadioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center' },
  radioOuterActive: { borderColor: BRAND[800] },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND[800] },
  filterOptionText: { fontSize: 16, color: '#475569', fontWeight: '600' },
  filterOptionTextActive: { color: '#1A1A1A', fontWeight: '800' },
  filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: BRAND[100], borderColor: BRAND[800] },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: BRAND[800], fontWeight: '800' },
});
