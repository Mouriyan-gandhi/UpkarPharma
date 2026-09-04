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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
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

const DEFAULT_IP = '192.168.1.18';
// HTTPS API base injected at build time via app.config.js (extra.apiBaseUrl).
// When present (production/preview builds) it overrides the dev IP entirely.
// Guard for string only — the public manifest may serialize an unset value as {}.
const _rawApiBase = Constants.expoConfig?.extra?.apiBaseUrl;
const API_BASE_URL: string | null =
  typeof _rawApiBase === 'string' && _rawApiBase.length > 0
    ? _rawApiBase
    : Platform.OS === 'web'
    ? 'http://localhost:3000'
    : null;
const MIN_ORDER_VALUE = 2500;

// Feature flag: launch as a Derma-only catalog. When true, the mobile
// catalog auto-filters to category='Derma' and hides the Category + Company
// filter sections in the filter drawer, exposing only Body System (sub-cat).
// Flip via env: expo start with CATALOG_MODE=all to restore multi-cat.
const CATALOG_MODE = Constants.expoConfig?.extra?.catalogMode ?? 'derma';
const DERMA_ONLY = CATALOG_MODE === 'derma';
const LOCKED_CATEGORY = 'Derma';

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

// ── ProductImageCarousel — swipeable images + dot indicator ───────────────────
function getProductImages(product: any): string[] {
  if (Array.isArray(product?.images) && product.images.length > 0) {
    return product.images.filter((u: any) => typeof u === 'string' && u.length > 0);
  }
  if (typeof product?.image === 'string' && product.image.length > 0) return [product.image];
  return [CATEGORY_IMAGES[product?.category] || DEFAULT_PRODUCT_IMAGE];
}

function ProductImageCarousel({ product, height = 260, cornerRadius = 20 }: { product: any; height?: number; cornerRadius?: number; }) {
  const images = getProductImages(product);
  const scrollRef = useRef<any>(null);
  const [idx, setIdx] = useState(0);
  const width = SCREEN_WIDTH - 48; // fits inside bottomSheet (padding 24 each side)

  const onEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    if (i !== idx) setIdx(i);
  };

  if (images.length === 1) {
    return (
      <Image
        source={{ uri: images[0] }}
        style={{ width: '100%', height, borderRadius: cornerRadius, marginBottom: 12, backgroundColor: '#f1f5f9' }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        style={{ borderRadius: cornerRadius, overflow: 'hidden', backgroundColor: '#f1f5f9' }}
      >
        {images.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            style={{ width, height, backgroundColor: '#f1f5f9' }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {/* Dots */}
      <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {images.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === idx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.6)',
            }}
          />
        ))}
      </View>
      {/* Counter chip */}
      <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{idx + 1} / {images.length}</Text>
      </View>
    </View>
  );
}

// ── QtyControl — reusable qty stepper with tap-to-type ────────────────────────
function QtyControl({
  value,
  onAdd,
  onSub,
  onSet,
  compact = false,
}: {
  value: number;
  onAdd: () => void;
  onSub: () => void;
  onSet: (n: number) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const dim = compact
    ? { padH: 12, padV: 8, fs: 15, width: 44 }
    : { padH: 14, padV: 10, fs: 16, width: 52 };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
      <TouchableOpacity
        onPress={onSub}
        style={{ paddingHorizontal: dim.padH, paddingVertical: dim.padV }}
        hitSlop={{ top: 8, left: 8, bottom: 8, right: 4 }}
      >
        <Text style={{ fontSize: 18, fontWeight: '800', color: BRAND[800] }}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={{
          width: dim.width,
          textAlign: 'center',
          fontSize: dim.fs,
          fontWeight: '800',
          color: '#1A1A1A',
          paddingVertical: dim.padV - 2,
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={5}
        value={text}
        onChangeText={(v) => {
          const clean = v.replace(/[^0-9]/g, '');
          setText(clean);
          if (clean === '') return; // wait for blur before committing removal
          const n = parseInt(clean, 10);
          if (!isNaN(n)) onSet(n);
        }}
        onBlur={() => {
          const n = parseInt(text, 10);
          if (text === '' || isNaN(n) || n <= 0) {
            onSet(0);
            setText('0');
          }
        }}
      />
      <TouchableOpacity
        onPress={onAdd}
        style={{ paddingHorizontal: dim.padH, paddingVertical: dim.padV }}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 4 }}
      >
        <Text style={{ fontSize: 18, fontWeight: '800', color: BRAND[800] }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Toast System ──────────────────────────────────────────────────────────────
let _showToast: ((msg: string, type?: 'success' | 'error' | 'info') => void) | null = null;

function ToastProvider({ children }) {
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  const show = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
    timerRef.current = setTimeout(() => setToast(null), 2800);
  };

  _showToast = show;

  const bg = toast?.type === 'error' ? '#dc2626' : toast?.type === 'info' ? '#2563eb' : '#059669';

  return (
    <View style={{ flex: 1 }}>
      {children}
      {toast && (
        <Animated.View style={{ position: 'absolute', top: 56, left: 16, right: 16, zIndex: 999, opacity: fadeAnim }}>
          <View style={{ backgroundColor: bg, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', ...SHADOWS.lg }}>
            <Ionicons name={toast.type === 'error' ? 'alert-circle' : toast.type === 'info' ? 'information-circle' : 'checkmark-circle'} size={20} color="#fff" style={{ marginRight: 10 }} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 }}>{toast.msg}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export const showToast = (msg: string, type?: 'success' | 'error' | 'info') => _showToast?.(msg, type);

// ── Skeleton Loader ────────────────────────────────────────────────────────────
function SkeletonCard({ height = 80, style = {} }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] });

  return (
    <Animated.View style={[{ height, borderRadius: 16, backgroundColor: '#e2e8f0', marginBottom: 12, opacity }, style]} />
  );
}

// ── UpkemLoader — branded spinner ───────────────────────────────────────────
// A gentle pulse+halo around the UPKEM logo mark. Replaces ActivityIndicator
// in the fullscreen splash and other high-visibility loading states so the
// brand is reinforced during waits (which is where users stare longest).
// `size` = logo diameter in px. `variant='light'` for use on the dark green
// splash background; `variant='dark'` for use on white cards.
function UpkemLoader({ size = 72, variant = 'dark' }: { size?: number; variant?: 'light' | 'dark' }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.35] });
  const haloColor = variant === 'light' ? '#52B788' : '#0B2618';
  const logoBg = variant === 'light' ? 'rgba(255,255,255,0.08)' : 'transparent';

  return (
    <View style={{ width: size * 1.6, height: size * 1.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: haloColor,
          opacity: haloOpacity,
          transform: [{ scale: haloScale }],
        }}
      />
      <Animated.View style={{ transform: [{ scale }], backgroundColor: logoBg, borderRadius: size / 2, padding: 6 }}>
        <Image
          source={require('./assets/logo-mark.png')}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

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
      <td style="text-align:center;">12%</td>
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
            <tr><td><strong>GST/IGST</strong></td><td></td><td></td><td>₹${taxableValue.toFixed(2)}</td><td></td><td></td></tr>
            <tr><td><strong>GST TAX</strong></td><td></td><td></td><td>₹${gstAmount.toFixed(2)}</td><td></td><td></td></tr>
            <tr><td><strong>CGST</strong></td><td></td><td></td><td>6% ₹${cgst.toFixed(2)}</td><td>9%</td><td>14% 0.00</td></tr>
            <tr><td><strong>SGST</strong></td><td></td><td></td><td>6% ₹${sgst.toFixed(2)}</td><td>9%</td><td>14% 0.00</td></tr>
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

// Generate and share invoice PDF (client-side fallback — used only if server
// invoice fetch fails or for legacy orders without an invoice row).
const handleInvoiceGenerate = async (order: any, user: any) => {
  try {
    const html = generateInvoiceHTML(order, user);
    const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (err) {
    Alert.alert('Error', 'Could not generate invoice. Please try again.');
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Server-authoritative invoice helpers. Fetch /api/invoices/{id}/html which
// includes admin-filled batch/expiry + Draft/Approved badge.
// ────────────────────────────────────────────────────────────────────────────
async function fetchServerInvoiceHTML(orderId: string): Promise<string | null> {
  const { serverIp, sessionId } = useStore.getState();
  const base = API_BASE_URL || `http://${serverIp}:3000`;
  const url = `${base}/api/invoices/${encodeURIComponent(orderId)}/html?token=${encodeURIComponent(sessionId || '')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Open the invoice in the native PDF preview (print dialog).
// Users can save-to-Files, share, or print from the native sheet.
const viewServerInvoice = async (order: any, user: any) => {
  const html = await fetchServerInvoiceHTML(order.id);
  if (!html) {
    Alert.alert(
      'Invoice not ready',
      'The admin hasn\'t generated your invoice yet. Once they approve it, you\'ll get a push notification.',
      [{ text: 'View draft anyway (client-side)', onPress: () => handleInvoiceGenerate(order, user) }, { text: 'OK' }]
    );
    return;
  }
  try {
    await Print.printAsync({ html });
  } catch (err) {
    Alert.alert('Error', 'Could not open invoice.');
  }
};

// Generate PDF from server HTML and share (WhatsApp/Files/etc.).
const downloadServerInvoice = async (order: any, user: any) => {
  const html = await fetchServerInvoiceHTML(order.id);
  const source = html || generateInvoiceHTML(order, user);   // fallback
  try {
    const { uri } = await Print.printToFileAsync({ html: source, width: 612, height: 792 });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (err) {
    Alert.alert('Error', 'Could not download invoice.');
  }
};

const useStore = create((set, get) => ({
  serverIp: DEFAULT_IP,
  setServerIp: (ip) => set({ serverIp: ip }),
  user: null,
  setUser: (user) => set({ user }),
  sessionId: null,
  setSessionId: (sessionId) => set({ sessionId }),
  refreshToken: null,
  setRefreshToken: (refreshToken) => set({ refreshToken }),
  // Auth headers for every protected API call. The session_id (issued by
  // /api/auth/verify) is sent as a Bearer token the backend validates.
  authHeaders: () => {
    const sid = get().sessionId;
    return sid
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sid}` }
      : { 'Content-Type': 'application/json' };
  },
  // Refresh the Supabase access token when it expires (default 1h). Returns
  // true if we got a fresh token, false if the refresh_token itself is dead
  // (in which case the caller should force the user back to Login).
  refreshSession: async () => {
    const rt = get().refreshToken;
    if (!rt) return false;
    try {
      const res = await fetch(`${get().getBaseUrl()}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.access_token) return false;
      set({ sessionId: data.access_token, refreshToken: data.refresh_token || rt });
      await AsyncStorage.setItem('@upkem_session_id', data.access_token);
      if (data.refresh_token) await AsyncStorage.setItem('@upkem_refresh_token', data.refresh_token);
      return true;
    } catch {
      return false;
    }
  },
  // Fetch wrapper that transparently refreshes on 401 and retries once. Use
  // this for any bearer-protected call so callers don't have to hand-roll
  // refresh logic. Falls through to a bare fetch if there's no session.
  authFetch: async (url, init = {}) => {
    const doFetch = () => fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), ...get().authHeaders() },
    });
    let res = await doFetch();
    if (res.status === 401 && get().refreshToken) {
      const ok = await get().refreshSession();
      if (ok) res = await doFetch();
    }
    return res;
  },
  cart: {},
  products: [],
  setProducts: (products) => set({ products }),
  usersList: [],
  setUsersList: (usersList) => set({ usersList }),
  addToCart: (productId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    set((state) => {
      const prev = state.cart[productId] || 0;
      if (prev === 0) showToast('Added to cart');
      return { cart: { ...state.cart, [productId]: prev + 1 } };
    });
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
  repeatOrder: (order) => {
    if (!order?.items?.length) return 0;
    const newCart: Record<string, number> = {};
    let added = 0;
    order.items.forEach((it: any) => {
      const id = it.id ?? it.product_id;
      const qty = Number(it.quantity) || 0;
      if (id != null && qty > 0) {
        newCart[id] = (newCart[id] || 0) + qty;
        added += qty;
      }
    });
    set({ cart: newCart });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showToast(`${order.items.length} items added to cart`);
    return added;
  },
  orders: [],
  setOrders: (orders) => set({ orders }),
  notifications: [],
  unreadNotifs: 0,
  setNotifications: (notifications: any[]) => set({
    notifications,
    unreadNotifs: (notifications || []).filter((n) => !n.read).length,
  }),
  
  // Production builds use the HTTPS base URL baked in via app.config.js
  // (extra.apiBaseUrl). The plain-IP override is a LOCAL DEV fallback only.
  getBaseUrl: () => API_BASE_URL || `http://${get().serverIp}:3000`,
  getApiUrl: () => `${get().getBaseUrl()}/api/data`,
  getTokenUrl: () => `${get().getBaseUrl()}/api/user/token`,
  getDeleteAccountUrl: () => `${get().getBaseUrl()}/api/user/delete`,
  getOtpUrl: () => `${get().getBaseUrl()}/api/auth/otp`,
  getVerifyUrl: () => `${get().getBaseUrl()}/api/auth/verify`,
  getDevLoginUrl: () => `${get().getBaseUrl()}/api/auth/dev-login`,
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
    color: animValue.interpolate({ inputRange: [0, 1], outputRange: ['#94a3b8', BRAND[700]] }),
    fontWeight: '800',
    letterSpacing: 0.5,
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{
        backgroundColor: '#F7FAF8',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: isFocused ? BRAND[700] : '#e2e8f0',
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
      }}>
        {icon && <Ionicons name={icon} size={18} color={isFocused ? BRAND[700] : '#94a3b8'} style={{ marginRight: 12 }} />}
        <View style={{ flex: 1, position: 'relative', height: '100%', justifyContent: 'center' }}>
          <Animated.Text style={labelStyle}>{label}</Animated.Text>
          <TextInput
            style={{ color: '#1A1A1A', fontSize: 15, fontWeight: '700', height: '100%', paddingTop: 16, paddingBottom: 0 }}
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

// --- Signup Screen (Simplified — 3 fields: firm, phone, business type) ---
function SignupScreen({ setCurrentScreen }) {
  const [form, setForm] = useState({ phone: '', store_name: '', user_type: 'Retailer' });
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tempIp, setTempIp] = useState('');

  const serverIp = useStore((state) => state.serverIp);
  const setServerIp = useStore((state) => state.setServerIp);
  const getSignupUrl = useStore((state) => state.getSignupUrl);

  const boxAnims = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    setTempIp(serverIp);
    Animated.stagger(150, boxAnims.map(anim => Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 8 }))).start();
  }, [serverIp]);

  const canSubmit = form.phone.trim().length >= 10 && form.store_name.trim().length > 0 && form.user_type;

  const handleSignup = async () => {
    if (!canSubmit) return Alert.alert('Missing info', 'Please enter your firm name, phone (10 digits), and select a business type.');
    setIsLoading(true);
    try {
      const res = await fetch(getSignupUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Request sent', 'Registration submitted. Please log in once approved — you can complete your profile after signing in.');
        setCurrentScreen('Login');
      } else {
        Alert.alert('Error', data.error || 'Signup failed');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error. Please try again.');
    }
    setIsLoading(false);
  };

  const businessTypes = [
    { key: 'Retailer',              label: 'Retailer / Pharmacy', icon: 'storefront',       hint: 'GST required later' },
    { key: 'Clinic',                label: 'Clinic / Hospital',   icon: 'business',         hint: 'Registration required later' },
    { key: 'Doctor',                label: 'Doctor',              icon: 'medkit',           hint: 'DMC / Registration later' },
    { key: 'Doctor with Pharmacy',  label: 'Doctor + Pharmacy',   icon: 'fitness',          hint: 'DL + GST required later' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F7FAF8' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ marginBottom: 28, alignItems: 'center' }}>
          <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: BRAND[50], borderWidth: 1.5, borderColor: BRAND[100], justifyContent: 'center', alignItems: 'center', marginBottom: 18 }}>
            <Ionicons name="shield-checkmark" size={32} color={BRAND[800]} />
          </View>
          <Text style={{ fontSize: 30, fontWeight: '900', color: '#1A1A1A', letterSpacing: -1 }}>Get started</Text>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600', marginTop: 8, textAlign: 'center', maxWidth: 300, lineHeight: 20 }}>
            Just 3 details to submit for approval.{'\n'}You can complete your profile after signing in.
          </Text>
        </View>

        {/* Box 1: Identity — just firm + phone */}
        <Animated.View
          style={{
            opacity: boxAnims[0],
            transform: [{ translateY: boxAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 14,
            borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm,
          }}
        >
          <Text style={{ color: BRAND[800], fontSize: 11, fontWeight: '800', marginBottom: 14, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Your firm
          </Text>
          <PremiumTextInput
            label="Firm / Clinic Name"
            icon="business"
            value={form.store_name}
            onChangeText={(t) => setForm({ ...form, store_name: t })}
          />
          <PremiumTextInput
            label="Phone Number (10 digits)"
            icon="call"
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={(t) => setForm({ ...form, phone: t.replace(/[^0-9]/g, '').slice(0, 10) })}
          />
        </Animated.View>

        {/* Box 2: Business type */}
        <Animated.View
          style={{
            opacity: boxAnims[1],
            transform: [{ translateY: boxAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 24,
            borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm,
          }}
        >
          <Text style={{ color: BRAND[800], fontSize: 11, fontWeight: '800', marginBottom: 14, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Business type
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            {businessTypes.map((bt) => {
              const isSelected = form.user_type === bt.key;
              return (
                <TouchableOpacity
                  key={bt.key}
                  onPress={() => { Haptics.selectionAsync(); setForm({ ...form, user_type: bt.key }); }}
                  style={{
                    width: '48%',
                    backgroundColor: isSelected ? BRAND[800] : '#F7FAF8',
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: isSelected ? BRAND[800] : '#e2e8f0',
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name={bt.icon as any} size={22} color={isSelected ? '#fff' : BRAND[700]} style={{ marginBottom: 10 }} />
                  <Text style={{ color: isSelected ? '#fff' : '#1A1A1A', fontWeight: isSelected ? '800' : '700', fontSize: 13 }} numberOfLines={2}>
                    {bt.label}
                  </Text>
                  <Text style={{ color: isSelected ? BRAND[100] : '#64748b', fontSize: 10, fontWeight: '600', marginTop: 3 }} numberOfLines={1}>
                    {bt.hint}
                  </Text>
                  {isSelected && (
                    <View style={{ position: 'absolute', top: 10, right: 10 }}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Submit */}
        <AnimatedPressable
          style={[
            styles.buttonPrimary,
            { marginBottom: 20, paddingVertical: 18, opacity: canSubmit ? 1 : 0.55, backgroundColor: BRAND[800] },
            canSubmit ? SHADOWS.glowGreen : {},
          ]}
          onPress={handleSignup}
          disabled={isLoading || !canSubmit}
        >
          <Text style={[styles.buttonPrimaryText, { fontSize: 17, color: '#fff' }]}>
            {isLoading ? 'Submitting…' : 'Submit for approval'}
          </Text>
        </AnimatedPressable>

        <TouchableOpacity style={{ alignItems: 'center', marginBottom: 12 }} onPress={() => setCurrentScreen('Login')}>
          <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 14 }}>
            Already registered? <Text style={{ color: BRAND[700], fontWeight: '900' }}>Log in</Text>
          </Text>
        </TouchableOpacity>

        {/* NETWORK SETUP link — dev-only. Prod builds have API_BASE_URL baked in
            from eas.json so the user never needs to configure an IP. */}
        {!API_BASE_URL && (
          <TouchableOpacity style={{ alignItems: 'center', marginBottom: 40 }} onPress={() => setShowConfig(true)}>
            <Text style={{ color: '#475569', fontWeight: '800', fontSize: 10, letterSpacing: 1 }}>NETWORK SETUP</Text>
          </TouchableOpacity>
        )}

        {/* Network Config Modal (kept for dev) */}
        <Modal visible={showConfig} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Network Setup</Text>
              <Text style={{ marginBottom: 20, color: '#64748b', fontSize: 14 }}>Enter the Next.js API IPv4 address.</Text>
              <TextInput style={styles.inputFieldConfig} value={tempIp} onChangeText={setTempIp} placeholder="192.168.x.x" keyboardType="numbers-and-punctuation" />
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
  const [password, setPassword] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tempIp, setTempIp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(100)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const otpBoxAnims = useRef([0,1,2,3,4,5].map(() => new Animated.Value(0))).current;
  const otpInputRefs = useRef([]);

  const setUser = useStore((state) => state.setUser);
  const serverIp = useStore((state) => state.serverIp);
  const setServerIp = useStore((state) => state.setServerIp);
  const getOtpUrl = useStore((state) => state.getOtpUrl);
  const getVerifyUrl = useStore((state) => state.getVerifyUrl);
  const getDevLoginUrl = useStore((state) => state.getDevLoginUrl);

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
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8, delay: idx * 60 }).start();
      });
    }
  }, [otpSent]);

  const handleOtpChange = (text, index) => {
    const newDigits = [...otpDigits];
    newDigits[index] = text;
    setOtpDigits(newDigits);
    if (text && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
    if (text && index === 5) {
      Keyboard.dismiss();
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const devLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(getDevLoginUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, device_info: Platform.OS }),
      });
      const data = await res.json();
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useStore.getState().setSessionId(data.session_id);
        if (data.refresh_token) useStore.getState().setRefreshToken(data.refresh_token);
        setUser(data.user);
        await AsyncStorage.setItem('@upkem_session_id', data.session_id);
        if (data.refresh_token) await AsyncStorage.setItem('@upkem_refresh_token', data.refresh_token);
        await AsyncStorage.setItem('@upkem_user', JSON.stringify(data.user));
        // Route straight to the correct home based on role. Previously we
        // hardcoded 'Home' (the customer landing) and let a subscription
        // effect flip to 'AdminHome' one tick later, which caused admins
        // to see a flash of the customer UI on login.
        const isAdmin = data.user?.is_admin || data.user?.role === 'admin';
        setCurrentScreen(isAdmin ? 'AdminHome' : 'Home');
      } else if (data.pending) {
        setUser(data.user);
        setCurrentScreen('PendingApproval');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Login failed', data.error || 'Check phone and password.');
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Connection Error', 'Could not reach the server. Check NETWORK CONFIGURATION.');
    }
    setIsLoading(false);
  };

  const requestOtp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (phone.length < 10) return Alert.alert('Invalid', 'Enter a valid 10-digit phone number');
    if (!password || password.length === 0) {
      return Alert.alert('Password required', 'Enter the password shared by your distributor. SMS-based OTP login isn\'t enabled yet — coming with the MSG91 rollout.');
    }
    return devLogin();
  };

  const verifyOtp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const otp = otpDigits.join('');
    if (otp.length < 6) return Alert.alert('Error', 'Enter all 6 digits');
    if (!confirmation) return Alert.alert('Error', 'Please request OTP first');
    setIsLoading(true);
    try {
      const credential = await confirmation.confirm(otp);
      const idToken = await credential.user.getIdToken();

      const res = await fetch(getVerifyUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, device_info: Platform.OS }),
      });
      const data = await res.json();

      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useStore.getState().setSessionId(data.session_id);
        if (data.refresh_token) useStore.getState().setRefreshToken(data.refresh_token);
        setUser(data.user);
        await AsyncStorage.setItem('@upkem_session_id', data.session_id);
        if (data.refresh_token) await AsyncStorage.setItem('@upkem_refresh_token', data.refresh_token);
        await AsyncStorage.setItem('@upkem_user', JSON.stringify(data.user));
        const isAdmin = data.user?.is_admin || data.user?.role === 'admin';
        setCurrentScreen(isAdmin ? 'AdminHome' : 'Home');
        registerForPushNotificationsAsync().then((pushToken) => {
          if (!pushToken) return;
          fetch(useStore.getState().getTokenUrl(), {
            method: 'POST',
            headers: useStore.getState().authHeaders(),
            body: JSON.stringify({ token: pushToken }),
          }).catch(() => {});
        });
      } else if (data.pending) {
        setUser(data.user);
        setCurrentScreen('PendingApproval');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Access Denied', data.error || 'Verification failed');
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Invalid Code', 'The OTP you entered is incorrect or has expired.');
    }
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
          <Text style={styles.loginSubtitle}>{otpSent ? `6-digit code sent to +91 ${phone}` : 'Enter the phone number registered with Upkem.\nWe\'ll send a secure OTP via SMS.'}</Text>
          
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
              <View style={[styles.inputWrapper, { marginTop: 12 }]}>
                <TextInput
                  style={[styles.inputField, { paddingLeft: 16 }]}
                  placeholder="Dev password (skip OTP)"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  autoCapitalize="none"
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="go"
                />
              </View>
              <Text style={{color: '#6B7280', fontSize: 13, marginBottom: 24, marginTop: 12, lineHeight: 20}}>By continuing you agree to Upkem's <Text style={{textDecorationLine: 'underline', fontWeight: '700'}}>Terms</Text> & <Text style={{textDecorationLine: 'underline', fontWeight: '700'}}>Privacy Policy</Text></Text>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <AnimatedPressable style={styles.buttonPrimary} onPress={requestOtp} disabled={isLoading}>
                  <Text style={styles.buttonPrimaryText}>
                    {isLoading
                      ? (password ? 'Signing in...' : 'Sending...')
                      : (password ? 'Sign in  →' : 'Send OTP  →')}
                  </Text>
                </AnimatedPressable>
              </Animated.View>
            </>
          ) : (
            <>
              {/* Individual OTP Boxes */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
                {[0,1,2,3,4,5].map((idx) => (
                  <Animated.View key={idx} style={{ 
                    transform: [{ scale: otpBoxAnims[idx].interpolate({ inputRange: [0,1], outputRange: [0.5, 1] }) }],
                    opacity: otpBoxAnims[idx],
                  }}>
                    <TextInput
                      ref={ref => otpInputRefs.current[idx] = ref}
                      style={{
                        width: 48, height: 58, borderRadius: 16, textAlign: 'center',
                        fontSize: 24, fontWeight: '900', color: '#1A1A1A',
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

          {/* NETWORK CONFIGURATION link — dev-only. See note above the SignupScreen version. */}
          {!API_BASE_URL && (
            <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setShowConfig(true)}>
              <Text style={[styles.configText, { fontSize: 11 }]}>NETWORK CONFIGURATION</Text>
            </TouchableOpacity>
          )}

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

// --- Profile completeness helpers ---
type ProfileField = { key: string; label: string; icon: string; };

function getRequiredProfileFields(userType?: string): ProfileField[] {
  const base: ProfileField[] = [
    { key: 'address',           label: 'Delivery address', icon: 'location-outline' },
    { key: 'city',              label: 'District',         icon: 'map-outline' },
    { key: 'email',             label: 'Email',            icon: 'mail-outline' },
  ];
  const t = (userType || '').toLowerCase();
  if (t.includes('retailer')) {
    base.push({ key: 'gst_number',   label: 'GST number',   icon: 'receipt-outline' });
    base.push({ key: 'drug_license', label: 'Drug licence', icon: 'document-text-outline' });
  } else if (t.includes('doctor with pharmacy')) {
    base.push({ key: 'drug_license',        label: 'Drug licence',        icon: 'document-text-outline' });
    base.push({ key: 'gst_number',          label: 'GST number',          icon: 'receipt-outline' });
    base.push({ key: 'registration_number', label: 'Registration number', icon: 'shield-checkmark-outline' });
  } else if (t.includes('doctor')) {
    base.push({ key: 'registration_number', label: 'Registration number', icon: 'shield-checkmark-outline' });
  } else if (t.includes('clinic') || t.includes('hospital')) {
    base.push({ key: 'registration_number', label: 'Registration number', icon: 'shield-checkmark-outline' });
    base.push({ key: 'gst_number',          label: 'GST number',          icon: 'receipt-outline' });
  }
  return base;
}

function getMissingProfileFields(user: any): ProfileField[] {
  if (!user) return [];
  return getRequiredProfileFields(user.user_type).filter(f => {
    const v = user[f.key];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

// --- Home Screen ---
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

// Banner slots — admin-editable later. Keep 4 slots.
// action: 'catalog' | 'short-expiry' | 'orders' | 'profile'
const HOME_BANNERS: any[] = [
  {
    id: 'b1',
    kicker: 'Just landed',
    title: 'New arrivals from top brands',
    subtitle: 'Fresh stock ready to dispatch',
    cta: 'Browse now',
    bg: BRAND[800], fg: '#fff', accent: BRAND[100], iconColor: BRAND[800],
    icon: 'sparkles', ctaBg: 'rgba(255,255,255,0.18)', action: 'catalog',
  },
  {
    id: 'b2',
    kicker: 'Better margins',
    title: 'Short-expiry offers, up to 40% off',
    subtitle: 'Select SKUs at special rates',
    cta: 'See deals',
    bg: '#F59E0B', fg: '#1A1A1A', accent: '#FEF3C7', iconColor: '#B45309',
    icon: 'flame', ctaBg: 'rgba(0,0,0,0.10)', action: 'short-expiry',
  },
  {
    id: 'b3',
    kicker: 'One tap reorder',
    title: 'Bring back your last order',
    subtitle: 'Same items, one tap away',
    cta: 'Repeat now',
    bg: BRAND[100], fg: BRAND[900], accent: BRAND[800], iconColor: '#fff',
    icon: 'repeat', ctaBg: 'rgba(0,0,0,0.08)', action: 'orders',
  },
  {
    id: 'b4',
    kicker: 'Free delivery',
    title: 'Orders above ₹5,000 ship free',
    subtitle: 'Same-day dispatch on Chennai orders',
    cta: 'Order now',
    bg: '#0EA5E9', fg: '#fff', accent: '#E0F2FE', iconColor: '#0369A1',
    icon: 'car', ctaBg: 'rgba(255,255,255,0.18)', action: 'catalog',
  },
];

function HeroCarousel({ onAction }) {
  const scrollRef = useRef<any>(null);
  const [idx, setIdx] = useState(0);
  const CARD_WIDTH = SCREEN_WIDTH - 32;
  const SNAP = CARD_WIDTH + 12;

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((prev) => {
        const next = (prev + 1) % HOME_BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * SNAP, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const onMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / SNAP);
    if (i !== idx) setIdx(i);
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {HOME_BANNERS.map((b, i) => (
          <TouchableOpacity
            key={b.id}
            activeOpacity={0.92}
            onPress={() => onAction?.(b)}
            style={{
              width: CARD_WIDTH,
              marginRight: i === HOME_BANNERS.length - 1 ? 0 : 12,
              backgroundColor: b.bg,
              borderRadius: 22,
              padding: 18,
              minHeight: 140,
              justifyContent: 'space-between',
              overflow: 'hidden',
              ...SHADOWS.md,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: b.fg, opacity: 0.75, textTransform: 'uppercase', marginBottom: 6 }}>
                  {b.kicker}
                </Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: b.fg, letterSpacing: -0.4, lineHeight: 24 }}>
                  {b.title}
                </Text>
                <Text style={{ fontSize: 12, color: b.fg, opacity: 0.8, fontWeight: '600', marginTop: 4, lineHeight: 16 }}>
                  {b.subtitle}
                </Text>
              </View>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: b.accent, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={b.icon} size={26} color={b.iconColor} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <View style={{ backgroundColor: b.ctaBg, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: b.fg, fontWeight: '800', fontSize: 12 }}>{b.cta}</Text>
                <Ionicons name="arrow-forward" size={12} color={b.fg} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 }}>
        {HOME_BANNERS.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === idx ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === idx ? BRAND[800] : '#CBD5E1',
            }}
          />
        ))}
      </View>
    </View>
  );
}

function HomeScreen({ setCurrentScreen, onCategorySelect, onRefresh }) {
  const products = useStore((s) => s.products);
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const repeatOrderAction = useStore((s) => s.repeatOrder);
  const notifications = useStore((s) => s.notifications);
  const unreadNotifs = useStore((s) => s.unreadNotifs);
  const featured = products.slice(0, 8);
  const lastOrder = orders.length > 0 ? orders[0] : null;
  const availableCredit = user ? Math.max(0, (user.credit_limit || 0) - (user.credit_balance || 0)) : 0;
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const creditUtilization = user ? ((user.credit_balance || 0) / Math.max(user.credit_limit || 1, 1)) * 100 : 0;

  const markAllRead = async () => {
    try {
      await fetch(`${useStore.getState().getBaseUrl()}/api/notifications`, {
        method: 'PATCH',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ all: true }),
      });
      useStore.getState().setNotifications(
        (useStore.getState().notifications || []).map((n: any) => ({ ...n, read: true }))
      );
    } catch { /* ignore */ }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (onRefresh) await onRefresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleBanner = (b: any) => {
    Haptics.selectionAsync();
    if (b.action === 'catalog') { onCategorySelect('All'); setCurrentScreen('Catalog'); }
    else if (b.action === 'short-expiry') { onCategorySelect('__short_expiry__'); setCurrentScreen('Catalog'); }
    else if (b.action === 'orders') { setCurrentScreen('Orders'); }
    else if (b.action === 'profile') { setCurrentScreen('Profile'); }
  };

  const handleRepeat = () => {
    if (!lastOrder) return;
    const added = repeatOrderAction(lastOrder);
    if (added > 0) setCurrentScreen('Cart');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND[800]} colors={[BRAND[800]]} />}
      >
        {/* Header */}
        <View style={styles.homeHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={require('./assets/pharma_logo.jpeg')} style={styles.headerLogo} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>Good {getTimeOfDay()},</Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: BRAND[800], letterSpacing: -0.3 }} numberOfLines={1}>
                {user?.store_name || 'UPKEM LABS'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={() => setShowNotifs(true)} style={{ position: 'relative' }}>
              <Ionicons name={unreadNotifs > 0 ? 'notifications' : 'notifications-outline'} size={24} color={unreadNotifs > 0 ? BRAND[800] : '#1A1A1A'} />
              {unreadNotifs > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#dc2626', paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#F7FAF8' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setCurrentScreen('Profile')}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{user?.store_name?.[0] || 'U'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Credit warning — safety alert, keep on top */}
        {creditUtilization > 75 && (
          <TouchableOpacity
            onPress={() => setCurrentScreen('Profile')}
            style={{
              marginHorizontal: 16, marginBottom: 12,
              backgroundColor: creditUtilization > 90 ? '#FEF2F2' : '#FFF7ED',
              padding: 14, borderRadius: 16,
              flexDirection: 'row', alignItems: 'center',
              borderWidth: 1, borderColor: creditUtilization > 90 ? '#FEE2E2' : '#FED7AA',
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={creditUtilization > 90 ? 'warning' : 'alert-circle-outline'}
              size={20}
              color={creditUtilization > 90 ? '#DC2626' : '#EA580C'}
              style={{ marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: creditUtilization > 90 ? '#991B1B' : '#9A3412' }}>
                {creditUtilization > 90 ? 'Credit almost full' : 'Credit running low'}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: creditUtilization > 90 ? '#B91C1C' : '#C2410C', marginTop: 1 }}>
                ₹{availableCredit.toLocaleString('en-IN')} remaining · Tap to view payment options
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        )}

        {/* Complete your profile — nudges only when required fields are missing */}
        {(() => {
          const missing = getMissingProfileFields(user);
          const requiredCount = getRequiredProfileFields(user?.user_type).length;
          if (!user || missing.length === 0) return null;
          const filled = requiredCount - missing.length;
          const pct = requiredCount > 0 ? Math.round((filled / requiredCount) * 100) : 0;
          return (
            <TouchableOpacity
              onPress={() => setCurrentScreen('Profile')}
              activeOpacity={0.9}
              style={{
                marginHorizontal: 16, marginBottom: 12,
                backgroundColor: '#EFF6FF', padding: 14, borderRadius: 16,
                borderWidth: 1, borderColor: '#BFDBFE',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Ionicons name="person-circle-outline" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#1E3A8A' }}>Complete your profile</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#1D4ED8', marginTop: 2 }}>
                    {filled} of {requiredCount} done · add {missing.slice(0, 2).map(m => m.label).join(', ')}
                    {missing.length > 2 ? ` +${missing.length - 2} more` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#93C5FD" />
              </View>
              {/* Progress bar */}
              <View style={{ height: 4, backgroundColor: '#DBEAFE', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: 4, backgroundColor: '#2563EB', borderRadius: 2 }} />
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* Search shortcut */}
        <TouchableOpacity
          style={styles.homeSearchBar}
          onPress={() => setCurrentScreen('Catalog')}
          activeOpacity={0.85}
        >
          <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
          <Text style={styles.homeSearchPlaceholder}>Search medicines, brands…</Text>
        </TouchableOpacity>

        {/* 1. HERO BANNER CAROUSEL */}
        <HeroCarousel onAction={handleBanner} />

        {/* 2. CATEGORIES */}
        <View style={styles.homeSectionRow}>
          <Text style={styles.homeSectionTitle}>Shop by category</Text>
          <TouchableOpacity onPress={() => { onCategorySelect('All'); setCurrentScreen('Catalog'); }}>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 14 }}
        >
          {HOME_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.name}
              style={{ alignItems: 'center', width: 68 }}
              onPress={() => { Haptics.selectionAsync(); onCategorySelect(cat.name); setCurrentScreen('Catalog'); }}
              activeOpacity={0.8}
            >
              <View style={[styles.homeCategoryCircle, { backgroundColor: BRAND[800], width: 56, height: 56, borderRadius: 20, marginBottom: 6 }]}>
                <Ionicons name={cat.icon as any} size={24} color="#fff" />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' }} numberOfLines={2}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 3. TOP PRODUCTS */}
        <View style={[styles.homeSectionRow, { marginTop: 20 }]}>
          <View>
            <Text style={styles.homeSectionTitle}>Top products</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '500', marginTop: 2 }}>Hot sellers this month</Text>
          </View>
          <TouchableOpacity onPress={() => { onCategorySelect('All'); setCurrentScreen('Catalog'); }}>
            <Text style={styles.seeAllText}>View all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {featured.length === 0 ? (
            [1, 2, 3].map(i => (
              <View key={i} style={[styles.featuredCard, { padding: 10 }]}>
                <SkeletonCard height={110} style={{ marginBottom: 8 }} />
                <SkeletonCard height={12} style={{ width: '80%', marginBottom: 6 }} />
                <SkeletonCard height={10} style={{ width: '50%', marginBottom: 6 }} />
                <SkeletonCard height={16} style={{ width: '40%' }} />
              </View>
            ))
          ) : featured.map((p: any) => (
            <TouchableOpacity
              key={p.id}
              style={styles.featuredCard}
              onPress={() => { onCategorySelect('All'); setCurrentScreen('Catalog'); }}
              activeOpacity={0.85}
            >
              <View>
                <Image source={{ uri: getProductImage(p) }} style={styles.featuredCardImage} />
                {/* Top-seller badge */}
                <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: BRAND[800], paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="flame" size={10} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 }}>TOP</Text>
                </View>
              </View>
              <Text style={styles.featuredCardName} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.featuredCardCompany} numberOfLines={1}>{p.company}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 10, marginBottom: 10 }}>
                <Text style={styles.featuredCardPrice}>₹{p.price_ptr || p.price}</Text>
                <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '700' }}>● In stock</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 4. LAST ORDER → REPEAT */}
        {lastOrder && (
          <>
            <View style={[styles.homeSectionRow, { marginTop: 20 }]}>
              <View>
                <Text style={styles.homeSectionTitle}>Your last order</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '500', marginTop: 2 }}>
                  Repeat with one tap
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCurrentScreen('Profile')}>
                <Text style={styles.seeAllText}>All orders</Text>
              </TouchableOpacity>
            </View>

            <View
              style={{
                marginHorizontal: 16,
                borderRadius: 22,
                borderWidth: 1.5,
                borderColor: BRAND[500],
                backgroundColor: BRAND[50],
                padding: 16,
                ...SHADOWS.sm,
              }}
            >
              {/* Summary row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Ionicons name="receipt-outline" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: BRAND[700], fontWeight: '700' }}>
                    {lastOrder.id || 'Last order'} · {lastOrder.date || '—'}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: BRAND[900], letterSpacing: -0.3, marginTop: 2 }}>
                    {(lastOrder.items?.length || 0)} items · ₹{(lastOrder.total || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Item chips */}
              {lastOrder.items?.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, marginBottom: 12 }}
                >
                  {lastOrder.items.slice(0, 8).map((it: any, i: number) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: '#fff',
                        paddingLeft: 4, paddingRight: 10, paddingVertical: 4,
                        borderRadius: 12, borderWidth: 1, borderColor: BRAND[100],
                      }}
                    >
                      <Image source={{ uri: getProductImage(it) }} style={{ width: 26, height: 26, borderRadius: 6, marginRight: 6, backgroundColor: '#f1f5f9' }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND[900], maxWidth: 130 }} numberOfLines={1}>
                        {it.name}
                      </Text>
                      {it.quantity ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND[700], marginLeft: 6 }}>×{it.quantity}</Text>
                      ) : null}
                    </View>
                  ))}
                  {lastOrder.items.length > 8 && (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: BRAND[100], justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND[700] }}>+{lastOrder.items.length - 8} more</Text>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Repeat CTA */}
              <TouchableOpacity
                onPress={handleRepeat}
                activeOpacity={0.9}
                style={{
                  backgroundColor: BRAND[800],
                  paddingVertical: 14,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  ...SHADOWS.glowGreen,
                }}
              >
                <Ionicons name="repeat" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 }}>Repeat this order</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Account snapshot moved to the Profile tab — no need to duplicate it
            on the browse-focused Home screen. Users find it via the tab bar. */}
      </ScrollView>

      {/* ── Notifications drawer ─────────────────────────────────────────────── */}
      <Modal visible={showNotifs} animationType="slide" transparent onRequestClose={() => setShowNotifs(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowNotifs(false)} />
          <View style={{ backgroundColor: '#fff', maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>Notifications</Text>
                <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 }}>
                  {unreadNotifs > 0 ? `${unreadNotifs} unread` : 'All caught up'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {unreadNotifs > 0 && (
                  <TouchableOpacity onPress={markAllRead} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: BRAND[50], borderWidth: 1, borderColor: BRAND[100] }}>
                    <Text style={{ color: BRAND[800], fontWeight: '800', fontSize: 12 }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotifs(false)} style={{ padding: 8 }}>
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            <ScrollView style={{ maxHeight: 500 }}>
              {(!notifications || notifications.length === 0) ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Ionicons name="notifications-off-outline" size={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: '600' }}>No notifications yet</Text>
                </View>
              ) : (
                notifications.map((n: any) => {
                  const iconName =
                    n.type === 'invoice_ready' ? 'document-text' :
                    n.type === 'order_packaged' ? 'cube-outline' :
                    n.type === 'order_dispatched' ? 'car-outline' :
                    n.type === 'order_rejected' ? 'close-circle-outline' :
                    n.type === 'profile_change_approved' ? 'checkmark-circle-outline' :
                    n.type === 'profile_change_rejected' ? 'close-circle-outline' :
                    'notifications-outline';
                  const iconColor = n.type === 'order_rejected' || n.type === 'profile_change_rejected' ? '#dc2626' : BRAND[700];
                  const dateStr = new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                  return (
                    <TouchableOpacity
                      key={n.id}
                      onPress={async () => {
                        if (!n.read) {
                          try {
                            await fetch(`${useStore.getState().getBaseUrl()}/api/notifications`, {
                              method: 'PATCH',
                              headers: useStore.getState().authHeaders(),
                              body: JSON.stringify({ ids: [n.id] }),
                            });
                            useStore.getState().setNotifications(
                              (useStore.getState().notifications || []).map((x: any) => x.id === n.id ? { ...x, read: true } : x)
                            );
                          } catch {}
                        }
                        // Deeplink: open the linked order tracking screen if there's one
                        if (n.meta?.order_id) {
                          const ord = (useStore.getState().orders || []).find((o: any) => o.id === n.meta.order_id);
                          if (ord) {
                            setShowNotifs(false);
                            setCurrentScreen('Orders');
                          }
                        }
                      }}
                      style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc', backgroundColor: n.read ? '#fff' : BRAND[50] + '80' }}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: n.read ? '#F7FAF8' : BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                        <Ionicons name={iconName as any} size={20} color={iconColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A', flex: 1 }} numberOfLines={1}>{n.title}</Text>
                          {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND[600] }} />}
                        </View>
                        {n.body && <Text style={{ fontSize: 12, color: '#475569', fontWeight: '500', marginTop: 3, lineHeight: 17 }} numberOfLines={2}>{n.body}</Text>}
                        <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '600', marginTop: 4 }}>{dateStr}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  // Multi-select filters. `__short_expiry__` is a sentinel from the home banner.
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory && initialCategory !== 'All' && initialCategory !== '__short_expiry__' ? [initialCategory] : []
  );
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('All');
  const [sortOption, setSortOption] = useState('name_asc');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [filterShortExpiry, setFilterShortExpiry] = useState(initialCategory === '__short_expiry__');
  // Type-ahead search inside the filter sheet — Derma launch has ~20
  // sub-categories which makes the chip cloud hard to scan. Search is only
  // rendered when there are enough options to justify it.
  const [systemSearch, setSystemSearch] = useState('');

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
  const clearAllFilters = () => { setSelectedCategories([]); setSelectedSystems([]); setSelectedCompany('All'); setSortOption('name_asc'); setFilterShortExpiry(false); };
  const activeFilterCount = selectedCategories.length + selectedSystems.length + (selectedCompany !== 'All' ? 1 : 0) + (filterShortExpiry ? 1 : 0);

  let filteredProducts = productsList.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) ||
      (p.company || '').toLowerCase().includes(q) ||
      (p.composition || '').toLowerCase().includes(q);
    // In DERMA_ONLY mode, hard-lock category to Derma before any user filters
    // apply. Everything else keeps working — but the user cannot bypass this.
    const matchesLockedCategory = !DERMA_ONLY || p.category === LOCKED_CATEGORY;
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(p.category);
    const matchesSystem = selectedSystems.length === 0 || selectedSystems.includes(p.body_system);
    const matchesCompany = selectedCompany === 'All' || p.company === selectedCompany;
    const matchesShortExp = !filterShortExpiry || !!p.short_expiry || (p.discount_percent && p.discount_percent > 0);
    return matchesLockedCategory && matchesSearch && matchesCategory && matchesSystem && matchesCompany && matchesShortExp;
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

            {/* Quick filter row — always visible, primary offer surface */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setFilterShortExpiry(v => !v); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: filterShortExpiry ? '#F59E0B' : '#FFF7ED',
                  borderWidth: 1,
                  borderColor: filterShortExpiry ? '#F59E0B' : '#FED7AA',
                }}
              >
                <Ionicons name="flame" size={13} color={filterShortExpiry ? '#fff' : '#B45309'} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: filterShortExpiry ? '#fff' : '#B45309' }}>Short expiry offers</Text>
              </TouchableOpacity>
              {/* Placeholder for future quick filters (top-selling, in-stock) */}
            </ScrollView>

            {/* Active filter chips (only shown once user has picks) */}
            {activeFilterCount > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 4 }}>
                {filterShortExpiry && (
                  <TouchableOpacity style={[styles.activeChip, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]} onPress={() => setFilterShortExpiry(false)}>
                    <Text style={[styles.activeChipText, { color: '#B45309' }]}>Short expiry ✕</Text>
                  </TouchableOpacity>
                )}
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
        renderItem={({ item }) => {
          const basePrice = item.price_ptr || item.price || 0;
          const disc = Number(item.discount_percent) || 0;
          const netPrice = disc > 0 ? Math.round(basePrice * (1 - disc / 100)) : basePrice;
          const isShort = !!item.short_expiry;
          return (
            <TouchableOpacity style={styles.productCard} onPress={() => setSelectedProduct(item)} activeOpacity={0.8}>
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: getProductImage(item) }} style={styles.productThumb} />
                {(isShort || disc > 0) && (
                  <View style={{ position: 'absolute', top: -6, left: -6, backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 3, ...SHADOWS.sm }}>
                    <Ionicons name="flame" size={10} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 }}>
                      {disc > 0 ? `${disc}% OFF` : 'DEAL'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.productDesc}>{item.company} • {item.category}</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.productPrice}>₹{netPrice}</Text>
                  {disc > 0 && (
                    <Text style={{ fontSize: 13, color: '#94a3b8', fontWeight: '700', textDecorationLine: 'line-through' }}>
                      ₹{basePrice}
                    </Text>
                  )}
                  <View style={[styles.stockBadge, item.stock < 10 ? { backgroundColor: '#fee2e2' } : {}]}>
                    <Text style={[styles.stockText, item.stock < 10 ? { color: '#dc2626' } : {}]}>
                      {item.stock > 0 ? `${item.stock} in stock` : 'Out of Stock'}
                    </Text>
                  </View>
                </View>
                {isShort && item.expiry_date && (
                  <Text style={{ marginTop: 6, fontSize: 11, color: '#B45309', fontWeight: '700' }}>
                    Exp: {item.expiry_date}
                  </Text>
                )}
              </View>
              <View style={styles.cartAction}>
                {(!cart[item.id] || cart[item.id] === 0) ? (
                  <AnimatedPressable style={styles.addBtn} onPress={() => addToCart(item.id)}>
                    <Text style={styles.addBtnText}>ADD</Text>
                  </AnimatedPressable>
                ) : (
                  <QtyControl
                    value={cart[item.id]}
                    onAdd={() => addToCart(item.id)}
                    onSub={() => removeFromCart(item.id)}
                    onSet={(n) => setCartQuantity(item.id, n)}
                    compact
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          productsList.length === 0 ? (
            <View style={{ paddingTop: 8 }}>
              {[1,2,3,4,5].map(i => (
                <View key={i} style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 24, marginBottom: 16, padding: 20, borderWidth: 1, borderColor: '#f1f5f9' }}>
                  <SkeletonCard height={72} style={{ width: 72, borderRadius: 16, marginRight: 14, marginBottom: 0 }} />
                  <View style={{ flex: 1 }}>
                    <SkeletonCard height={18} style={{ width: '70%', marginBottom: 8 }} />
                    <SkeletonCard height={12} style={{ width: '50%', marginBottom: 8 }} />
                    <SkeletonCard height={20} style={{ width: '40%', marginBottom: 0 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={40} color="#94a3b8" style={{marginBottom: 8}} />
              <Text style={styles.emptyText}>No products found.</Text>
            </View>
          )
        }
      />

      {/* Product Details Modal */}
      <Modal visible={!!selectedProduct} transparent animationType="slide" onRequestClose={() => setSelectedProduct(null)}>
        <View style={styles.modalOverlayBottom}>
          <View style={[styles.bottomSheet, { maxHeight: '92%', paddingBottom: 24 }]}>
            <View style={styles.dragHandle} />
            {selectedProduct && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                  <ProductImageCarousel product={selectedProduct} height={240} />

                  <Text style={styles.modalTitle}>{selectedProduct.name}</Text>
                  <Text style={{ color: '#64748b', fontSize: 15, marginTop: 2, marginBottom: 12, fontWeight: '600' }}>
                    {selectedProduct.company}
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    <View style={styles.systemPillActive}><Text style={styles.systemTextActive}>{selectedProduct.category}</Text></View>
                    {selectedProduct.body_system ? <View style={styles.systemPill}><Text style={styles.systemText}>{selectedProduct.body_system}</Text></View> : null}
                    {selectedProduct.short_expiry ? (
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="flame" size={12} color="#B45309" />
                        <Text style={{ color: '#B45309', fontWeight: '800', fontSize: 12 }}>Short expiry offer</Text>
                      </View>
                    ) : null}
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

                {/* Sticky footer: close / add-to-cart with inline qty */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedProduct(null)}
                    style={{ paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16, backgroundColor: '#f1f5f9' }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#475569' }}>Close</Text>
                  </TouchableOpacity>
                  {(!cart[selectedProduct.id] || cart[selectedProduct.id] === 0) ? (
                    <AnimatedPressable
                      style={{ flex: 1, backgroundColor: BRAND[800], paddingVertical: 16, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, ...SHADOWS.glowGreen }}
                      onPress={() => { addToCart(selectedProduct.id); }}
                    >
                      <Ionicons name="cart-outline" size={18} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 }}>Add to cart</Text>
                    </AnimatedPressable>
                  ) : (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BRAND[50], paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1.5, borderColor: BRAND[500] }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND[800] }}>In cart</Text>
                      <QtyControl
                        value={cart[selectedProduct.id]}
                        onAdd={() => addToCart(selectedProduct.id)}
                        onSub={() => removeFromCart(selectedProduct.id)}
                        onSet={(n) => setCartQuantity(selectedProduct.id, n)}
                        compact
                      />
                    </View>
                  )}
                </View>
              </>
            )}
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

              {/* Company (multi-select with checkmarks) — hidden in Derma-only launch */}
              {!DERMA_ONLY && (
                <>
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
                </>
              )}

              {/* Category — hidden in Derma-only launch (locked server-side) */}
              {!DERMA_ONLY && (
                <>
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
                </>
              )}

              {/* Body System / Sub-category — always visible; the primary filter in Derma mode */}
              {systems.length > 0 && (() => {
                const q = systemSearch.trim().toLowerCase();
                const filtered = q ? systems.filter(s => s.toLowerCase().includes(q)) : systems;
                const showSearch = systems.length > 8;
                return (
                  <>
                    <View style={styles.filterSectionTitleRow}>
                      <Text style={[styles.filterSectionTitle, { marginTop: 0, marginBottom: 0 }]}>{DERMA_ONLY ? 'Sub-category' : 'Body System / Target'}</Text>
                      {selectedSystems.length > 0 && (
                        <View style={styles.filterCountBadge}>
                          <Text style={styles.filterCountText}>{selectedSystems.length}</Text>
                        </View>
                      )}
                    </View>
                    {showSearch && (
                      <View style={styles.filterSearchWrap}>
                        <Ionicons name="search" size={16} color="#94a3b8" />
                        <TextInput
                          value={systemSearch}
                          onChangeText={setSystemSearch}
                          placeholder="Search sub-categories"
                          placeholderTextColor="#94a3b8"
                          style={styles.filterSearchInput}
                          autoCorrect={false}
                          autoCapitalize="none"
                        />
                        {systemSearch.length > 0 && (
                          <TouchableOpacity onPress={() => setSystemSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close-circle" size={18} color="#94a3b8" />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <View style={styles.filterChipsWrap}>
                      {filtered.map(sys => {
                        const isSelected = selectedSystems.includes(sys);
                        return (
                          <TouchableOpacity
                            key={sys}
                            style={[styles.filterChip, isSelected && styles.filterChipActive]}
                            onPress={() => toggleSystem(sys)}
                            activeOpacity={0.7}
                          >
                            {isSelected && <Ionicons name="checkmark" size={14} color={BRAND[800]} style={{ marginRight: 4 }} />}
                            <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>{sys}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {filtered.length === 0 && (
                        <Text style={styles.filterEmptyText}>No matches for "{systemSearch}"</Text>
                      )}
                    </View>
                  </>
                );
              })()}
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
        <TouchableOpacity
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
        </TouchableOpacity>
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
  // Latch that blocks the Review-order button from firing twice on
  // fast/repeated taps while the screen transition is happening.
  const [navigatingToReview, setNavigatingToReview] = useState(false);

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
                <QtyControl
                  value={item.quantity}
                  onAdd={() => addToCart(item.id)}
                  onSub={() => removeFromCart(item.id)}
                  onSet={(n) => setCartQuantity(item.id, n)}
                />
                {/* Tap the number to type qty directly */}
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
        {/* Plain TouchableOpacity (not AnimatedPressable) — the scale animation
            wrapper was swallowing taps on Android + RN Web, forcing users to
            double- or triple-tap. Also added hitSlop so accidental near-taps
            near the system gesture bar still count. */}
        <TouchableOpacity
          style={[
            { paddingVertical: 18, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
            isMinMet ? { backgroundColor: BRAND[800], ...SHADOWS.glowGreen } : { backgroundColor: '#E5E7EB' }
          ]}
          activeOpacity={0.75}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          disabled={!isMinMet || navigatingToReview}
          onPress={() => {
            if (!isMinMet || navigatingToReview) return;
            setNavigatingToReview(true);
            Haptics.selectionAsync();
            // Defer the screen change so React can render the disabled state
            // once before the transition — otherwise a double-tap can fire
            // twice before disabled propagates.
            setTimeout(() => setCurrentScreen('Review'), 0);
          }}
        >
          {navigatingToReview && <ActivityIndicator color="#fff" size="small" />}
          <Text style={{ color: isMinMet ? '#fff' : '#9CA3AF', fontSize: 16, fontWeight: '800' }}>
            {navigatingToReview ? 'Loading…' : isMinMet ? `Review order · ₹${totalValue.toLocaleString('en-IN')}` : `Add ₹${amountNeeded.toLocaleString('en-IN')} more`}
          </Text>
        </TouchableOpacity>
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

        {/* Invoice Actions — view (native PDF preview) + download/share */}
        <View style={{ width: '90%', marginBottom: 16, gap: 10 }}>
          <TouchableOpacity
            style={{ backgroundColor: BRAND[800], borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', ...SHADOWS.glowGreen }}
            onPress={() => viewServerInvoice(placedOrder, user)}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Ionicons name="eye" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>View Invoice UPD</Text>
              <Text style={{ fontSize: 12, color: BRAND[100], fontWeight: '500', marginTop: 1 }}>Draft — awaiting admin approval</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: BRAND[50], borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BRAND[100] }}
            onPress={() => downloadServerInvoice(placedOrder, user)}
          >
            <Ionicons name="download-outline" size={20} color={BRAND[800]} style={{ marginRight: 12 }} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND[800], flex: 1 }}>Download PDF / Share on WhatsApp</Text>
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

// --- Order status: 3-stage lifecycle (Invoicing → Packaging → Dispatch) ---
// Backwards-compat: old statuses map into the 3 stages.
const ORDER_STAGES = [
  { key: 'Invoicing', label: 'Invoicing',  icon: 'receipt-outline', desc: 'Invoice being generated' },
  { key: 'Packaging', label: 'Packaging',  icon: 'cube-outline',    desc: 'Order is being packed' },
  { key: 'Dispatch',  label: 'Dispatch',   icon: 'car-outline',     desc: 'Out for delivery' },
] as const;

function mapStatusToStageIdx(status?: string): number {
  const s = (status || '').toLowerCase();
  if (['invoicing', 'placed', 'accepted', 'confirmed'].includes(s)) return 0;
  if (['packaging', 'processing', 'packed'].includes(s)) return 1;
  if (['dispatch', 'dispatched', 'shipped', 'out for delivery', 'delivered', 'completed'].includes(s)) return 2;
  return -1;
}
function isTerminalRejected(status?: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'rejected' || s === 'cancelled';
}

// --- Order Tracking Screen ---
function OrderTrackingScreen({ setCurrentScreen, order }) {
  if (!order) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={{ color: '#64748b', fontSize: 16 }}>Order not found.</Text>
      </View>
    );
  }

  const currentIdx = mapStatusToStageIdx(order.status);
  const isRejected = isTerminalRejected(order.status);
  // Contextual desc override for Dispatch
  const TIMELINE_STEPS = ORDER_STAGES.map((step) =>
    step.key === 'Dispatch' && order.courier_name
      ? { ...step, desc: `Via ${order.courier_name}` }
      : step
  );

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
          <View style={{ backgroundColor: BRAND[50], borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND[800], justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Ionicons name={TIMELINE_STEPS[currentIdx]?.icon || 'time-outline'} size={20} color="#fff" />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND[800] }}>
                {TIMELINE_STEPS[currentIdx]?.label || order.status || 'Placed'}
              </Text>
              <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                {TIMELINE_STEPS[currentIdx]?.desc || 'Awaiting update'}
              </Text>
            </View>
          </View>
        )}

        {/* Invoice card — always visible on tracking. Reflects Draft vs Approved. */}
        {!isRejected && (
          <TouchableOpacity
            onPress={() => viewServerInvoice(order, useStore.getState().user)}
            style={{
              backgroundColor: '#fff', borderRadius: 16, padding: 14,
              marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9',
              flexDirection: 'row', alignItems: 'center',
            }}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 12,
              backgroundColor: currentIdx > 0 ? BRAND[800] : '#FEF3C7',
              justifyContent: 'center', alignItems: 'center', marginRight: 14,
            }}>
              <Ionicons name="document-text" size={20} color={currentIdx > 0 ? '#fff' : '#92400E'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A' }}>
                {currentIdx > 0 ? 'Invoice Ready' : 'Invoice Pending Approval'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 2 }}>
                {currentIdx > 0
                  ? 'Tap to view GST invoice · Save as PDF · Share on WhatsApp'
                  : 'Admin is reviewing — you can view the draft'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={BRAND[600]} />
          </TouchableOpacity>
        )}

        {/* 3-stage stepper: Invoicing → Packaging → Dispatch */}
        {!isRejected && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Progress</Text>

            {/* Horizontal stepper row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              {TIMELINE_STEPS.map((step, idx) => {
                const done = idx < currentIdx;
                const active = idx === currentIdx;
                const nextDone = idx < currentIdx;
                const isLast = idx === TIMELINE_STEPS.length - 1;
                return (
                  <React.Fragment key={step.key}>
                    <View style={{ alignItems: 'center' }}>
                      <View
                        style={{
                          width: active ? 44 : 36, height: active ? 44 : 36, borderRadius: 22,
                          backgroundColor: done || active ? BRAND[800] : '#E5E7EB',
                          justifyContent: 'center', alignItems: 'center',
                          borderWidth: active ? 3 : 0, borderColor: BRAND[100],
                        }}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        ) : (
                          <Ionicons name={step.icon as any} size={active ? 20 : 16} color={active ? '#fff' : '#94a3b8'} />
                        )}
                      </View>
                    </View>
                    {!isLast && (
                      <View style={{ flex: 1, height: 3, backgroundColor: nextDone ? BRAND[800] : '#E5E7EB', marginHorizontal: 4, borderRadius: 2 }} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>

            {/* Labels row aligned with the steps */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {TIMELINE_STEPS.map((step, idx) => {
                const done = idx < currentIdx;
                const active = idx === currentIdx;
                return (
                  <View key={step.key} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: done || active ? BRAND[800] : '#94a3b8' }}>{step.label}</Text>
                    {active && (
                      <Text numberOfLines={2} style={{ fontSize: 10, color: '#6B7280', fontWeight: '600', marginTop: 2, textAlign: 'center', paddingHorizontal: 4 }}>
                        {step.desc}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Delivery — appointed staff for this order */}
        {currentIdx === 2 && order.courier_name && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Delivery Assigned To</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A' }}>{order.courier_name}</Text>
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
    if (isTerminalRejected(status)) return { bg: '#fee2e2', text: '#dc2626' };
    const idx = mapStatusToStageIdx(status);
    if (idx === 0) return { bg: '#EFF6FF', text: '#2563EB' };   // Invoicing
    if (idx === 1) return { bg: '#FFF7ED', text: '#EA580C' };   // Packaging
    if (idx === 2) return { bg: '#ecfdf5', text: '#059669' };   // Dispatch
    return { bg: '#f1f5f9', text: '#475569' };
  };

  const displayStatus = (status?: string) => {
    if (isTerminalRejected(status)) return 'Rejected';
    const idx = mapStatusToStageIdx(status);
    return ORDER_STAGES[idx]?.label || status || 'Placed';
  };

  const filteredOrders = orders.filter(o => {
    if (activeFilter === 'All') return true;
    if (isTerminalRejected(o.status)) return activeFilter === 'Cancelled';
    const idx = mapStatusToStageIdx(o.status);
    if (activeFilter === 'Active')    return idx === 0 || idx === 1;
    if (activeFilter === 'Completed') return idx === 2;
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'flex-start' }}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => { Haptics.selectionAsync(); setActiveFilter(f); }}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              backgroundColor: activeFilter === f ? BRAND[800] : '#fff',
              borderWidth: 1, borderColor: activeFilter === f ? BRAND[800] : '#e2e8f0',
              alignSelf: 'flex-start',
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
                  <Text style={{ fontSize: 11, fontWeight: '800', color: sc.text, textTransform: 'uppercase' }}>{displayStatus(item.status)}</Text>
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
      { text: "Logout", style: "destructive", onPress: async () => {
        await AsyncStorage.multiRemove(['@upkem_session_id', '@upkem_refresh_token', '@upkem_user', '@upkem_cached_db']);
        setUser(null);
        clearCart();
        useStore.getState().clearCoupon();
        useStore.getState().setSessionId(null); useStore.getState().setRefreshToken(null);
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
                await AsyncStorage.multiRemove(['@upkem_session_id', '@upkem_refresh_token', '@upkem_user', '@upkem_cached_db']);
                setUser(null);
                clearCart();
                useStore.getState().clearCoupon();
                useStore.getState().setSessionId(null); useStore.getState().setRefreshToken(null);
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

  // Generic field editor
  const [editField, setEditField] = useState<null | { key: string; label: string; multiline?: boolean; keyboardType?: any; placeholder?: string }>(null);
  const [editValue, setEditValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const FIELD_META: Record<string, { label: string; multiline?: boolean; keyboardType?: any; placeholder?: string }> = {
    address:             { label: 'Delivery address', multiline: true,  placeholder: 'Building, street, area, PIN…' },
    email:               { label: 'Email',            keyboardType: 'email-address', placeholder: 'you@firm.com' },
    gst_number:          { label: 'GST number',       placeholder: '15-char GSTIN' },
    drug_license:        { label: 'Drug licence',     placeholder: 'e.g. TN-02-20B-XXXXX' },
    registration_number: { label: 'Registration number', placeholder: 'Council / firm registration' },
  };

  // Identity/verification fields — cannot be edited directly, need admin approval
  const LOCKED_FIELDS = new Set(['store_name', 'gst_number', 'drug_license', 'registration_number', 'user_type']);

  // Pending change requests (fetched from server) — used to badge locked fields
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  // Credit request state — separate from profile change requests; customer can
  // submit an ask ("please raise my limit by ₹X"), admin reviews on their side.
  const [creditRequests, setCreditRequests] = useState<any[]>([]);
  const [showCreditReqModal, setShowCreditReqModal] = useState(false);
  const [creditReqAmount, setCreditReqAmount] = useState('');
  const [creditReqNote, setCreditReqNote] = useState('');
  const [submittingCreditReq, setSubmittingCreditReq] = useState(false);

  const loadPendingRequests = async () => {
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/profile-change-requests?status=Pending`;
      const res = await useStore.getState().authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.requests || []);
      }
    } catch { /* ignore */ }
  };

  const loadCreditRequests = async () => {
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/credit-requests`;
      const res = await useStore.getState().authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setCreditRequests(data.requests || []);
      }
    } catch { /* ignore */ }
  };

  const submitCreditRequest = async () => {
    const amt = Number(creditReqAmount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Enter an amount', 'How much extra credit do you need?');
      return;
    }
    setSubmittingCreditReq(true);
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/credit-requests`;
      const res = await useStore.getState().authFetch(url, {
        method: 'POST',
        body: JSON.stringify({ amount: amt, note: creditReqNote.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Submit failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreditReqModal(false);
      setCreditReqAmount('');
      setCreditReqNote('');
      loadCreditRequests();
      Alert.alert('Request sent', 'Admin will review your credit request and notify you once decided.');
    } catch (e: any) {
      Alert.alert('Could not submit', e.message || 'Try again.');
    }
    setSubmittingCreditReq(false);
  };

  useEffect(() => { loadPendingRequests(); loadCreditRequests(); }, []);
  const pendingCreditReq = creditRequests.find((r) => r.status === 'Pending');

  // Fields currently in a pending change request
  const pendingFieldKeys = new Set<string>();
  for (const r of pendingRequests) {
    if (r.status === 'Pending' && r.changes) {
      Object.keys(r.changes).forEach((k) => pendingFieldKeys.add(k));
    }
  }

  const openEditField = (key: string) => {
    const meta = FIELD_META[key];
    if (!meta) return;
    setEditValue(user[key] || '');
    setEditField({ key, ...meta });
  };

  const saveEditField = async () => {
    if (!editField) return;
    setSavingField(true);
    const isLocked = LOCKED_FIELDS.has(editField.key);
    try {
      if (isLocked) {
        // Route through admin approval
        const url = `${useStore.getState().getBaseUrl()}/api/profile-change-requests`;
        const res = await fetch(url, {
          method: 'POST',
          headers: useStore.getState().authHeaders(),
          body: JSON.stringify({ changes: { [editField.key]: editValue } }),
        });
        if (res.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEditField(null);
          Alert.alert('Request Sent', 'Your change request has been submitted for admin approval. You\'ll get a notification once it\'s reviewed.');
          loadPendingRequests();
        } else {
          const data = await res.json().catch(() => ({}));
          Alert.alert('Could not submit', data.error || 'Please try again.');
        }
      } else {
        // Direct update via /api/data
        const url = useStore.getState().getApiUrl();
        const body: any = { action: 'update_profile', field: editField.key, value: editValue };
        if (editField.key === 'address') { body.action = 'update_address'; body.address = editValue; }
        await fetch(url, {
          method: 'POST',
          headers: useStore.getState().authHeaders(),
          body: JSON.stringify(body),
        });
        setUser({ ...user, [editField.key]: editValue });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditField(null);
      }
    } catch {
      Alert.alert('Network error', 'Please try again.');
    }
    setSavingField(false);
  };

  const missingFields = getMissingProfileFields(user);
  const requiredCount = getRequiredProfileFields(user?.user_type).length;
  const filledCount = requiredCount - missingFields.length;

  // Build info rows for business details (show ALL required fields, missing ones as "Tap to add")
  const businessDetails = getRequiredProfileFields(user?.user_type)
    .filter(f => f.key !== 'address' && f.key !== 'city') // shown in dedicated sections
    .map(f => ({ label: f.label, value: user[f.key], icon: f.icon, editable: !!FIELD_META[f.key], key: f.key }))
    .concat([
      { label: 'Business type', value: user.user_type, icon: 'people-outline', editable: false, key: 'user_type' },
      { label: 'Zone / State',  value: user.zone,      icon: 'globe-outline',  editable: false, key: 'zone' },
    ]);

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

        {/* Complete your profile — action list of missing fields */}
        {missingFields.length > 0 && (
          <View style={{ backgroundColor: '#EFF6FF', borderRadius: 16, marginBottom: 24, padding: 16, borderWidth: 1, borderColor: '#BFDBFE' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Ionicons name="person-circle-outline" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#1E3A8A' }}>Complete your profile</Text>
                <Text style={{ fontSize: 11, color: '#1D4ED8', fontWeight: '600', marginTop: 2 }}>
                  {filledCount} of {requiredCount} required · {missingFields.length} left
                </Text>
              </View>
            </View>
            <View style={{ height: 4, backgroundColor: '#DBEAFE', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
              <View style={{ width: `${(filledCount / Math.max(requiredCount, 1)) * 100}%`, height: 4, backgroundColor: '#2563EB', borderRadius: 2 }} />
            </View>
            {missingFields.map((f, idx) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => {
                  if (f.key === 'city') { setShowCityPicker(true); return; }
                  openEditField(f.key);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
                  backgroundColor: '#fff', marginTop: idx === 0 ? 0 : 8,
                  borderWidth: 1, borderColor: '#DBEAFE',
                }}
                activeOpacity={0.85}
              >
                <Ionicons name={f.icon as any} size={16} color="#2563EB" style={{ marginRight: 10 }} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#1E3A8A' }}>{f.label}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB', marginRight: 4 }}>Add</Text>
                <Ionicons name="add-circle" size={16} color="#2563EB" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Business & Compliance Details — always show all required fields, empty ones tappable */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Business & Compliance</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#f1f5f9' }}>
          {businessDetails.map((item, idx) => {
            const isSet = !!item.value;
            const Wrap: any = item.editable ? TouchableOpacity : View;
            return (
              <Wrap
                key={item.label}
                {...(item.editable ? { onPress: () => openEditField(item.key), activeOpacity: 0.85 } : {})}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 14, paddingHorizontal: 16,
                  borderBottomWidth: idx < businessDetails.length - 1 ? 1 : 0, borderBottomColor: '#f1f5f9',
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Ionicons name={item.icon as any} size={17} color={BRAND[700]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</Text>
                    {LOCKED_FIELDS.has(item.key) && <Ionicons name="lock-closed" size={9} color="#94a3b8" />}
                    {pendingFieldKeys.has(item.key) && (
                      <View style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#C2410C', letterSpacing: 0.5 }}>PENDING</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isSet ? '#1A1A1A' : '#94a3b8', marginTop: 2 }}>
                    {isSet ? item.value : 'Tap to add'}
                  </Text>
                </View>
                {item.editable && <Ionicons name={isSet ? 'create-outline' : 'add-circle-outline'} size={18} color={BRAND[600]} />}
              </Wrap>
            );
          })}
        </View>

        {/* Delivery Address & District */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Delivery Location</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#f1f5f9' }}>
          <TouchableOpacity onPress={() => openEditField('address')} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="location-outline" size={17} color={BRAND[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Full address</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: user.address ? '#1A1A1A' : '#94a3b8', marginTop: 2 }}>
                {user.address || 'Tap to add'}
              </Text>
            </View>
            <Ionicons name={user.address ? 'create-outline' : 'add-circle-outline'} size={18} color={BRAND[600]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCityPicker(true)} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="map-outline" size={17} color={BRAND[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>District</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: user.city ? '#1A1A1A' : '#94a3b8', marginTop: 2 }}>
                {user.city || 'Tap to select'}
              </Text>
            </View>
            <Ionicons name={user.city ? 'create-outline' : 'add-circle-outline'} size={18} color={BRAND[600]} />
          </TouchableOpacity>
        </View>

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

          {/* Request-more-credit CTA + pending state */}
          {pendingCreditReq ? (
            <View style={{ marginTop: 14, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="time-outline" size={18} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#78350F' }}>
                  Request pending · +₹{Number(pendingCreditReq.amount).toLocaleString('en-IN')}
                </Text>
                <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700', marginTop: 2 }}>Admin will review shortly.</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); setShowCreditReqModal(true); }}
              style={{
                marginTop: 14, borderRadius: 12, borderWidth: 1.5, borderColor: BRAND[600], borderStyle: 'dashed',
                paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={BRAND[700]} />
              <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND[700] }}>Request more credit</Text>
            </TouchableOpacity>
          )}

          {/* Recent decisions — last 2 non-pending */}
          {creditRequests.filter((r) => r.status !== 'Pending').slice(0, 2).map((r) => (
            <View key={r.id} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={r.status === 'Approved' ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={r.status === 'Approved' ? BRAND[600] : '#dc2626'}
              />
              <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                +₹{Number(r.amount).toLocaleString('en-IN')} · {r.status}
                {r.admin_note ? ` · ${r.admin_note}` : ''}
              </Text>
            </View>
          ))}
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
                  onPress={() => viewServerInvoice(order, user)}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Ionicons name="document-text-outline" size={17} color={BRAND[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>{order.id}</Text>
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>{order.date} · ₹{order.total?.toLocaleString('en-IN')}</Text>
                  </View>
                  <Ionicons name="eye-outline" size={18} color={BRAND[600]} />
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

      {/* Generic field editor modal */}
      <Modal visible={!!editField} transparent animationType="slide" onRequestClose={() => setEditField(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlayBottom}>
          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>
              {editField && LOCKED_FIELDS.has(editField.key) ? `Request change: ${editField.label}` : editField?.label}
            </Text>
            {editField && LOCKED_FIELDS.has(editField.key) ? (
              <View style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row' }}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#C2410C" style={{ marginRight: 10, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#9A3412', fontSize: 12, fontWeight: '800' }}>Admin approval required</Text>
                  <Text style={{ color: '#9A3412', fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 }}>
                    Identity fields (GST, licence, firm name) can't be changed directly. Your request goes to admin for review — you'll be notified once approved.
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
                This will update your profile.
              </Text>
            )}
            <TextInput
              style={[styles.inputFieldConfig, editField?.multiline ? { height: 100, textAlignVertical: 'top' } : {}, { marginBottom: 20 }]}
              multiline={editField?.multiline}
              placeholder={editField?.placeholder || ''}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType={editField?.keyboardType || 'default'}
              autoCapitalize={editField?.key === 'email' ? 'none' : 'sentences'}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setEditField(null)}>
                <Text style={{ fontWeight: '800', color: '#64748b', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <AnimatedPressable style={styles.btnSave} onPress={saveEditField} disabled={savingField}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  {savingField ? 'Saving…' : (editField && LOCKED_FIELDS.has(editField.key) ? 'Submit for approval' : 'Save')}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Request more credit modal */}
      <Modal visible={showCreditReqModal} transparent animationType="slide" onRequestClose={() => setShowCreditReqModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlayBottom}>
          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>Request more credit</Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
              Ask admin to raise your credit limit. Current limit ₹{(user.credit_limit || 0).toLocaleString('en-IN')}.
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Amount (₹)</Text>
            <TextInput
              style={[styles.inputFieldConfig, { marginBottom: 14 }]}
              placeholder="e.g. 50000"
              keyboardType="numeric"
              value={creditReqAmount}
              onChangeText={setCreditReqAmount}
            />
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Reason (optional)</Text>
            <TextInput
              style={[styles.inputFieldConfig, { height: 90, textAlignVertical: 'top', marginBottom: 20 }]}
              multiline
              placeholder="Why do you need more credit?"
              value={creditReqNote}
              onChangeText={setCreditReqNote}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setShowCreditReqModal(false)} disabled={submittingCreditReq}>
                <Text style={{ fontWeight: '800', color: '#64748b', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSave} onPress={submitCreditRequest} disabled={submittingCreditReq}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  {submittingCreditReq ? 'Submitting…' : 'Submit request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* District picker */}
      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={styles.modalOverlayBottom}>
          <View style={[styles.bottomSheet, { maxHeight: '70%' }]}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>Select District</Text>
            <Text style={{ color: BRAND[700], fontSize: 12, marginBottom: 16, fontWeight: '800', letterSpacing: 1 }}>TAMIL NADU</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {TN_DISTRICTS.map(city => (
                <TouchableOpacity
                  key={city}
                  style={{
                    paddingVertical: 14, paddingHorizontal: 16,
                    borderRadius: 12, marginBottom: 4,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: user.city === city ? BRAND[100] : 'transparent',
                  }}
                  onPress={async () => {
                    Haptics.selectionAsync();
                    setUser({ ...user, city, zone: user.zone || 'Tamil Nadu' });
                    setShowCityPicker(false);
                    try {
                      await fetch(useStore.getState().getApiUrl(), {
                        method: 'POST',
                        headers: useStore.getState().authHeaders(),
                        body: JSON.stringify({ action: 'update_profile', field: 'city', value: city }),
                      });
                    } catch { /* local update kept */ }
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: user.city === city ? '900' : '600', color: user.city === city ? BRAND[800] : '#1A1A1A' }}>{city}</Text>
                  {user.city === city && <Ionicons name="checkmark-circle" size={18} color={BRAND[700]} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowCityPicker(false)} style={{ marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: '#f1f5f9' }}>
              <Text style={{ fontWeight: '800', color: '#475569' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN SCREENS
// Admin uses the same auth flow — if the returned user has `is_admin`, they
// land on AdminHome. All admin actions use the existing /api/data endpoints
// with admin-only actions (update_status, add_product, update_product,
// raw_override for approvals).
// ═════════════════════════════════════════════════════════════════════════════

function AdminHomeScreen({ setCurrentScreen, onOpenApprovals, onOpenOrders, onOpenProducts, onOpenPricing, onOpenUsers, onOpenSchemes, onOpenAnalytics, onOpenNotifications, onOpenChangeRequests, onOpenCreditRequests, onExit }) {
  const usersList = useStore((s) => s.usersList) || [];
  const products = useStore((s) => s.products) || [];
  // NOTE: orders in the store are filtered to the current user by the polling
  // loop. Admins get the full list via a separate refresh. See fetchAPI logic.
  const orders = useStore((s) => s.orders) || [];
  const pendingUsers = usersList.filter((u: any) => !u.is_approved);
  const admin = useStore((s) => s.user);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Admin Portal</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5, marginTop: 2 }}>{admin?.store_name || 'UPKEM Admin'}</Text>
            </View>
            <TouchableOpacity onPress={onExit} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="log-out-outline" size={14} color="#475569" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#475569' }}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Snapshot cards */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Pending', value: pendingUsers.length, icon: 'person-add', color: '#F59E0B' },
            { label: 'Products', value: products.length, icon: 'cube', color: BRAND[700] },
            { label: 'Orders', value: orders.length, icon: 'receipt', color: '#2563EB' },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: s.color + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>{s.value}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Action tiles */}
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <AdminTile
            title="Approvals"
            subtitle={pendingUsers.length ? `${pendingUsers.length} pending` : 'No pending requests'}
            icon="person-add-outline"
            color="#F59E0B"
            urgent={pendingUsers.length > 0}
            onPress={onOpenApprovals}
          />
          <AdminTile
            title="Orders"
            subtitle="Update status: Invoicing → Packaging → Dispatch"
            icon="receipt-outline"
            color="#2563EB"
            onPress={onOpenOrders}
          />
          <AdminTile
            title="Products"
            subtitle="Add, edit, upload photos"
            icon="cube-outline"
            color={BRAND[700]}
            onPress={onOpenProducts}
          />
          <AdminTile
            title="Partners"
            subtitle="Credit · block · edit profile"
            icon="people-outline"
            color="#0EA5E9"
            onPress={onOpenUsers}
          />
          <AdminTile
            title="Schemes"
            subtitle="B2B coupons · % off · flat off"
            icon="pricetag-outline"
            color="#059669"
            onPress={onOpenSchemes}
          />
          <AdminTile
            title="Analytics"
            subtitle="Revenue · pipeline · top SKUs"
            icon="stats-chart-outline"
            color="#EA580C"
            onPress={onOpenAnalytics}
          />
          <AdminTile
            title="Notifications"
            subtitle="Broadcast push to partners"
            icon="megaphone-outline"
            color="#DB2777"
            onPress={onOpenNotifications}
          />
          <AdminTile
            title="Change requests"
            subtitle="Approve partner profile edits"
            icon="create-outline"
            color="#7C3AED"
            onPress={onOpenChangeRequests}
          />
          <AdminTile
            title="Credit requests"
            subtitle="Raise a partner's credit limit"
            icon="wallet-outline"
            color="#10B981"
            onPress={onOpenCreditRequests}
          />
          <AdminTile
            title="Pricing & Discounts"
            subtitle="Upload price sheet · per-customer discounts"
            icon="pricetags-outline"
            color="#7C3AED"
            onPress={onOpenPricing}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function AdminTile({ title, subtitle, icon, color, onPress, urgent = false }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1,
        borderColor: urgent ? color : '#f1f5f9',
        flexDirection: 'row', alignItems: 'center', ...SHADOWS.sm,
      }}
    >
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: color + '18', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A' }}>{title}</Text>
          {urgent && <View style={{ backgroundColor: color, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>NEW</Text></View>}
        </View>
        <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}

function AdminBackHeader({ title, subtitle, onBack, right }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
      <TouchableOpacity onPress={onBack} style={{ padding: 4, marginRight: 8 }}>
        <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.5 }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

// --- Admin Approvals ---
function AdminApprovalsScreen({ onBack, onRefresh }) {
  const usersList = useStore((s) => s.usersList) || [];
  const pending = usersList.filter((u: any) => !u.is_approved);
  const [busyId, setBusyId] = useState<any>(null);

  const setApproval = async (u: any, approve: boolean) => {
    setBusyId(u.id || u.phone);
    Haptics.selectionAsync();
    try {
      const url = useStore.getState().getApiUrl();
      // Use raw_override to flip is_approved. Backend accepts a db.users bulk.
      const nextUsers = usersList.map((row: any) =>
        (row.id === u.id || row.phone === u.phone) ? { ...row, is_approved: approve } : row
      );
      await fetch(url, {
        method: 'POST',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ action: 'raw_override', db: { users: nextUsers } }),
      });
      useStore.getState().setUsersList(nextUsers);
      showToast(approve ? 'User approved' : 'User rejected', approve ? 'success' : 'info');
      if (onRefresh) onRefresh();
    } catch {
      Alert.alert('Error', 'Could not update approval. Try again.');
    }
    setBusyId(null);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title="Approvals" subtitle={`${pending.length} pending`} onBack={onBack} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={pending}
        keyExtractor={(u: any) => String(u.id || u.phone)}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="checkmark-done" size={30} color={BRAND[700]} />
            </View>
            <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '800' }}>All caught up</Text>
            <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500', marginTop: 4 }}>No pending registration requests</Text>
          </View>
        }
        renderItem={({ item }) => {
          const busy = busyId === (item.id || item.phone);
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ color: BRAND[800], fontSize: 16, fontWeight: '900' }}>{item.store_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A' }}>{item.store_name || 'Unnamed'}</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>+91 {item.phone}</Text>
                </View>
                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                  <Text style={{ color: '#B45309', fontSize: 10, fontWeight: '900' }}>PENDING</Text>
                </View>
              </View>
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                {[
                  ['Type',           item.user_type],
                  ['Drug licence',   item.drug_license],
                  ['GST',            item.gst_number],
                  ['Reg. number',    item.registration_number],
                  ['City',           item.city],
                  ['Address',        item.address],
                  ['Email',          item.email],
                ].map(([label, value]) => (
                  <View key={label as string} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    <Text style={{ width: 100, fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
                    <Text style={{ flex: 1, fontSize: 12, color: value ? '#1A1A1A' : '#94a3b8', fontWeight: '700' }}>{value || '—'}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => setApproval(item, false)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', alignItems: 'center' }}
                >
                  <Text style={{ color: '#B91C1C', fontWeight: '900', fontSize: 13 }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => setApproval(item, true)}
                  style={{ flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: BRAND[800], alignItems: 'center', ...SHADOWS.glowGreen }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{busy ? 'Saving…' : 'Approve'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

// --- Admin Users (full CRUD for pharmacy partners) ---
// Approve pending, edit credit balance + limit, edit profile fields,
// block/unblock with reason. All actions hit /api/data POST with the
// admin-only action verbs (update_credit, update_user_profile, block_user,
// unblock_user) that the backend already exposes.
function AdminUsersScreen({ onBack, onRefresh }) {
  const usersList = useStore((s) => s.usersList) || [];
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'blocked'>('all');
  const [selected, setSelected] = useState<any>(null);

  const filtered = usersList
    .filter((u: any) => u.role !== 'admin')
    .filter((u: any) => {
      if (filter === 'pending') return !u.is_approved;
      if (filter === 'active')  return u.is_approved && !u.is_blocked;
      if (filter === 'blocked') return u.is_blocked;
      return true;
    })
    .filter((u: any) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (u.store_name || '').toLowerCase().includes(s)
          || (u.phone || '').includes(s)
          || (u.gst_number || '').toLowerCase().includes(s);
    });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title="Partners" subtitle={`${filtered.length} of ${usersList.filter((u: any) => u.role !== 'admin').length}`} onBack={onBack} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44, marginBottom: 10 }}>
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search store, phone, GST…"
            placeholderTextColor="#94a3b8"
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#0f172a', fontWeight: '600' }}
          />
          {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={16} color="#94a3b8" /></TouchableOpacity> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['all', 'pending', 'active', 'blocked'] as const).map((f) => {
            const active = filter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? BRAND[800] : '#f1f5f9' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '900', color: active ? '#fff' : '#475569', textTransform: 'capitalize' }}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
        data={filtered}
        keyExtractor={(u: any) => String(u.id || u.phone)}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="people-outline" size={36} color="#cbd5e1" />
            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700', marginTop: 10 }}>No partners match</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item)}
            activeOpacity={0.85}
            style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: item.is_blocked ? '#FECACA' : '#f1f5f9', ...SHADOWS.sm }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: item.is_blocked ? '#FEF2F2' : BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                <Text style={{ color: item.is_blocked ? '#B91C1C' : BRAND[800], fontSize: 14, fontWeight: '900' }}>{item.store_name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#1A1A1A' }} numberOfLines={1}>{item.store_name || 'Unnamed'}</Text>
                <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>+91 {item.phone} · {item.user_type || 'Retailer'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {!item.is_approved && (
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#B45309', fontSize: 10, fontWeight: '900' }}>PENDING</Text>
                  </View>
                )}
                {item.is_blocked && (
                  <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#B91C1C', fontSize: 10, fontWeight: '900' }}>BLOCKED</Text>
                  </View>
                )}
                {item.is_approved && !item.is_blocked && (
                  <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND[700] }}>₹{Number(item.credit_balance || 0).toLocaleString('en-IN')}</Text>
                )}
                <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', marginTop: 2 }}>Limit ₹{Number(item.credit_limit || 0).toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
      {selected && (
        <AdminUserDetailModal
          user={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); if (onRefresh) onRefresh(); }}
        />
      )}
    </View>
  );
}

// --- User detail sheet (edit credit, profile, block/unblock, approve) ---
function AdminUserDetailModal({ user, onClose, onSaved }: any) {
  const [tab, setTab] = useState<'overview' | 'credit' | 'profile' | 'danger'>('overview');
  const [busy, setBusy] = useState(false);
  const [creditLimit, setCreditLimit] = useState(String(user.credit_limit ?? 0));
  const [creditBalance, setCreditBalance] = useState(String(user.credit_balance ?? 0));
  const [profile, setProfile] = useState({
    store_name: user.store_name || '',
    drug_license: user.drug_license || '',
    gst_number: user.gst_number || '',
    registration_number: user.registration_number || '',
    address: user.address || '',
    email: user.email || '',
    user_type: user.user_type || 'Retailer',
    zone: user.zone || '',
    city: user.city || '',
  });
  const [blockReason, setBlockReason] = useState(user.blocked_reason || '');

  const post = async (body: any) => {
    setBusy(true);
    try {
      const res = await fetch(useStore.getState().getApiUrl(), {
        method: 'POST',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      return data;
    } finally {
      setBusy(false);
    }
  };

  const saveCredit = async () => {
    try {
      await post({
        action: 'update_credit',
        phone: user.phone,
        credit_limit: Number(creditLimit) || 0,
        credit_balance: Number(creditBalance) || 0,
      });
      showToast('Credit updated', 'success');
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const saveProfile = async () => {
    try {
      await post({ action: 'update_user_profile', phone: user.phone, ...profile });
      showToast('Profile updated', 'success');
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const approve = async () => {
    try {
      const usersList = useStore.getState().usersList || [];
      const next = usersList.map((u: any) => u.phone === user.phone ? { ...u, is_approved: true } : u);
      await post({ action: 'raw_override', db: { users: next } });
      useStore.getState().setUsersList(next);
      showToast('Approved', 'success');
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const doBlock = async () => {
    Alert.alert('Block partner?', `This will revoke ${user.store_name}'s active sessions immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => {
        try {
          await post({ action: 'block_user', phone: user.phone, reason: blockReason || null });
          showToast('User blocked', 'info');
          onSaved();
        } catch (e: any) {
          Alert.alert('Error', e.message);
        }
      }},
    ]);
  };

  const doUnblock = async () => {
    try {
      await post({ action: 'unblock_user', phone: user.phone });
      showToast('User unblocked', 'success');
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#F7FAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 24 }}>
          {/* Header */}
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Text style={{ color: BRAND[800], fontSize: 16, fontWeight: '900' }}>{user.store_name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#1A1A1A' }} numberOfLines={1}>{user.store_name}</Text>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>+91 {user.phone}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 4 }}>
            {(['overview', 'credit', 'profile', 'danger'] as const).map((t) => {
              const active = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: active ? (t === 'danger' ? '#FEE2E2' : BRAND[100]) : 'transparent' }}
                >
                  <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '900', color: active ? (t === 'danger' ? '#B91C1C' : BRAND[800]) : '#64748b', textTransform: 'capitalize' }}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {tab === 'overview' && (
              <View>
                {!user.is_approved && (
                  <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="warning" size={20} color="#B45309" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#78350F', fontWeight: '700' }}>This partner is awaiting approval.</Text>
                    <TouchableOpacity disabled={busy} onPress={approve} style={{ backgroundColor: BRAND[800], paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>{busy ? '…' : 'Approve'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {user.is_blocked && (
                  <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#B91C1C' }}>BLOCKED</Text>
                    {user.blocked_reason ? <Text style={{ fontSize: 12, color: '#7F1D1D', fontWeight: '600', marginTop: 4 }}>{user.blocked_reason}</Text> : null}
                  </View>
                )}
                <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f1f5f9' }}>
                  {[
                    ['Type', user.user_type],
                    ['Drug licence', user.drug_license],
                    ['GST', user.gst_number],
                    ['Reg. number', user.registration_number],
                    ['City', user.city],
                    ['Zone', user.zone],
                    ['Address', user.address],
                    ['Email', user.email],
                    ['Credit balance', `₹${Number(user.credit_balance || 0).toLocaleString('en-IN')}`],
                    ['Credit limit', `₹${Number(user.credit_limit || 0).toLocaleString('en-IN')}`],
                  ].map(([k, v]) => (
                    <View key={k as string} style={{ flexDirection: 'row', paddingVertical: 6 }}>
                      <Text style={{ width: 110, fontSize: 11, color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</Text>
                      <Text style={{ flex: 1, fontSize: 13, color: v ? '#0f172a' : '#94a3b8', fontWeight: '700' }}>{v || '—'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {tab === 'credit' && (
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f1f5f9' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Credit limit</Text>
                <TextInput value={creditLimit} onChangeText={setCreditLimit} keyboardType="numeric" placeholder="0" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 14 }} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Credit balance (available)</Text>
                <TextInput value={creditBalance} onChangeText={setCreditBalance} keyboardType="numeric" placeholder="0" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 14 }} />
                <TouchableOpacity disabled={busy} onPress={saveCredit} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Saving…' : 'Save credit'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {tab === 'profile' && (
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f1f5f9' }}>
                {([
                  ['store_name', 'Store name'],
                  ['user_type', 'Business type'],
                  ['drug_license', 'Drug licence'],
                  ['gst_number', 'GST number'],
                  ['registration_number', 'Registration number'],
                  ['email', 'Email'],
                  ['city', 'City'],
                  ['zone', 'Zone'],
                  ['address', 'Address'],
                ] as const).map(([k, label]) => (
                  <View key={k} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</Text>
                    <TextInput
                      value={(profile as any)[k]}
                      onChangeText={(v) => setProfile({ ...profile, [k]: v })}
                      placeholder={label}
                      placeholderTextColor="#94a3b8"
                      multiline={k === 'address'}
                      style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: '#0f172a', minHeight: k === 'address' ? 64 : undefined }}
                    />
                  </View>
                ))}
                <TouchableOpacity disabled={busy} onPress={saveProfile} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Saving…' : 'Save profile'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {tab === 'danger' && (
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FECACA' }}>
                {user.is_blocked ? (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a', marginBottom: 4 }}>Unblock partner</Text>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 12 }}>They'll be able to log in and place orders again.</Text>
                    <TouchableOpacity disabled={busy} onPress={doUnblock} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Working…' : 'Unblock'}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#B91C1C', marginBottom: 4 }}>Block partner</Text>
                    <Text style={{ fontSize: 12, color: '#7F1D1D', fontWeight: '600', marginBottom: 12 }}>Existing orders are preserved. Their sessions are revoked immediately and they can't log in.</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Reason (internal)</Text>
                    <TextInput value={blockReason} onChangeText={setBlockReason} multiline placeholder="e.g. Unpaid invoices > 60 days" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: '#0f172a', minHeight: 60, marginBottom: 12 }} />
                    <TouchableOpacity disabled={busy} onPress={doBlock} style={{ backgroundColor: '#B91C1C', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Working…' : 'Block partner'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// --- Admin Orders (list + status update) ---
function AdminOrdersScreen({ onBack, onOpenOrder }) {
  const orders = useStore((s) => s.orders) || [];
  const [filter, setFilter] = useState<'all' | 0 | 1 | 2 | 'rejected'>('all');
  const [q, setQ] = useState('');

  const filtered = orders.filter((o: any) => {
    if (q && !(String(o.id || '').toLowerCase().includes(q.toLowerCase()) || (o.store_name || '').toLowerCase().includes(q.toLowerCase()))) return false;
    if (filter === 'all') return true;
    if (filter === 'rejected') return isTerminalRejected(o.status);
    return mapStatusToStageIdx(o.status) === filter;
  });

  const chip = (label: string, val: any) => (
    <TouchableOpacity
      key={label}
      onPress={() => { Haptics.selectionAsync(); setFilter(val); }}
      style={{
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
        backgroundColor: filter === val ? BRAND[800] : '#fff',
        borderWidth: 1, borderColor: filter === val ? BRAND[800] : '#e2e8f0',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '800', color: filter === val ? '#fff' : '#475569' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title="Orders" subtitle={`${orders.length} total`} onBack={onBack} />
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" />
          <TextInput
            placeholder="Search order # or store"
            placeholderTextColor="#94a3b8"
            value={q}
            onChangeText={setQ}
            style={{ flex: 1, padding: 12, fontSize: 14, color: '#1A1A1A', fontWeight: '600' }}
          />
        </View>
      </View>
      {/* Explicit row + center + shrink so chips size to their content on RN Web
          (default column-flex + stretch made them draw as tall boxes). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}
        style={{ flexGrow: 0, marginBottom: 8 }}
      >
        {chip('All', 'all')}
        {chip('Invoicing', 0)}
        {chip('Packaging', 1)}
        {chip('Dispatch', 2)}
        {chip('Rejected', 'rejected')}
      </ScrollView>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={filtered}
        keyExtractor={(o: any) => String(o.id)}
        ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60 }}><Text style={{ color: '#64748b', fontWeight: '600' }}>No orders match this filter.</Text></View>}
        renderItem={({ item }) => {
          const idx = mapStatusToStageIdx(item.status);
          const rejected = isTerminalRejected(item.status);
          const stageColors = ['#EFF6FF', '#FFF7ED', '#ecfdf5'];
          const stageTextColors = ['#2563EB', '#EA580C', '#059669'];
          const bg = rejected ? '#fee2e2' : (stageColors[idx] || '#f1f5f9');
          const fg = rejected ? '#dc2626' : (stageTextColors[idx] || '#475569');
          const label = rejected ? 'Rejected' : (ORDER_STAGES[idx]?.label || item.status || '—');
          return (
            <TouchableOpacity
              onPress={() => onOpenOrder(item)}
              activeOpacity={0.85}
              style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A' }}>{item.id}</Text>
                <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: fg, textTransform: 'uppercase' }}>{label}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }} numberOfLines={1}>
                {item.store_name || item.store || item.user_phone || '—'} · {item.date} · {item.items?.length || 0} items
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '700' }}>Total</Text>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#1A1A1A' }}>₹{(item.total || 0).toLocaleString('en-IN')}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

function AdminOrderDetailScreen({ order, onBack, onOrderUpdated }) {
  if (!order) return <View style={styles.centeredContainer}><Text>Order missing</Text></View>;
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [invItems, setInvItems] = useState<any[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const currentIdx = mapStatusToStageIdx(order.status);
  const rejected = isTerminalRejected(order.status);

  // Fetch invoice + items (batch_no / expiry_date live here, not on the order)
  const loadInvoice = async () => {
    setInvLoading(true);
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/invoices/${encodeURIComponent(order.id)}`;
      const res = await fetch(url, { headers: useStore.getState().authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInvoice(data.invoice || null);
        setInvItems(data.items || []);
      } else {
        setInvoice(null);
        setInvItems([]);
      }
    } catch {
      // Non-fatal — legacy orders may have no invoice row
      setInvoice(null);
    }
    setInvLoading(false);
  };
  useEffect(() => { loadInvoice(); }, [order.id]);

  const setStage = async (newStatus: string, extra: any = {}) => {
    setBusy(true);
    Haptics.selectionAsync();
    try {
      const url = useStore.getState().getApiUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ collection: 'orders', action: 'update_status', item: { id: order.id, status: newStatus, ...extra } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const orders = useStore.getState().orders.map((o: any) => o.id === order.id ? { ...o, status: newStatus, ...extra } : o);
      useStore.getState().setOrders(orders);
      onOrderUpdated && onOrderUpdated({ ...order, status: newStatus, ...extra });
      showToast(`Moved to ${newStatus}`, 'success');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update status.');
    }
    setBusy(false);
  };

  const rejectOrder = () => {
    Alert.alert('Reject order', 'This will mark the order as rejected. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => setStage('Rejected') },
    ]);
  };

  const approveInvoice = async () => {
    Alert.alert('Approve invoice?', 'Customer will be notified and the order moves to Packaging.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        setBusy(true);
        try {
          const url = `${useStore.getState().getBaseUrl()}/api/invoices/${encodeURIComponent(order.id)}/approve`;
          const res = await fetch(url, { method: 'POST', headers: useStore.getState().authHeaders() });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed');
          showToast('Invoice approved', 'success');
          loadInvoice();
          const orders = useStore.getState().orders.map((o: any) => o.id === order.id ? { ...o, status: 'Packaging' } : o);
          useStore.getState().setOrders(orders);
          onOrderUpdated && onOrderUpdated({ ...order, status: 'Packaging' });
        } catch (e: any) {
          Alert.alert('Error', e.message);
        }
        setBusy(false);
      }},
    ]);
  };

  const stageWithCourier = (newStatus: string) => {
    if (newStatus === 'Dispatch') {
      setShowDispatch(true);
    } else {
      setStage(newStatus);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title={String(order.id)} subtitle={`${order.date || ''} · ₹${(order.total || 0).toLocaleString('en-IN')}`} onBack={onBack} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Customer */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</Text>
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A', marginTop: 4 }}>{order.store_name || order.store || '—'}</Text>
          <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 }}>{order.user_phone || order.phone || '—'}</Text>
          {order.address && <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 4 }}>{order.address}</Text>}
        </View>

        {/* Invoice card */}
        {invLoading ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' }}>
            <UpkemLoader size={40} variant="dark" />
          </View>
        ) : invoice ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: invoice.status === 'Draft' ? '#FDE68A' : BRAND[200] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Invoice</Text>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A', marginTop: 2 }}>{invoice.invoice_no}</Text>
              </View>
              <View style={{ backgroundColor: invoice.status === 'Draft' ? '#FEF3C7' : BRAND[100], paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: invoice.status === 'Draft' ? '#B45309' : BRAND[800] }}>{invoice.status?.toUpperCase()}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700' }}>Net</Text>
              <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '900' }}>₹{Number(invoice.net_amount || 0).toLocaleString('en-IN')}</Text>
            </View>
            {invoice.status === 'Draft' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity disabled={busy} onPress={() => setShowLines(true)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#475569' }}>Edit batch / expiry</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={approveInvoice} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND[800], alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{busy ? 'Working…' : 'Approve invoice'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 6 }}>
                Approved {invoice.approved_at ? new Date(invoice.approved_at).toLocaleString() : ''}
              </Text>
            )}
          </View>
        ) : null}

        {/* Status controls */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Set status</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {ORDER_STAGES.map((stg, i) => {
            const active = currentIdx === i && !rejected;
            const done = currentIdx > i && !rejected;
            return (
              <TouchableOpacity
                key={stg.key}
                disabled={busy || active}
                onPress={() => stageWithCourier(stg.key)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                  backgroundColor: active ? BRAND[800] : done ? BRAND[100] : '#fff',
                  borderWidth: 1, borderColor: active ? BRAND[800] : done ? BRAND[500] : '#e2e8f0',
                }}
              >
                <Ionicons name={stg.icon as any} size={16} color={active ? '#fff' : BRAND[800]} />
                <Text style={{ fontSize: 11, fontWeight: '900', color: active ? '#fff' : BRAND[800], marginTop: 4 }}>{stg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {(order.courier_name || order.tracking_id) && (
          <View style={{ backgroundColor: BRAND[50], borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, color: '#0f172a', fontWeight: '800' }}>
              📦 {order.courier_name || 'Courier'} · <Text style={{ fontWeight: '900' }}>{order.tracking_id || '—'}</Text>
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 16 }}>
          Current: <Text style={{ color: '#1A1A1A', fontWeight: '900' }}>{rejected ? 'Rejected' : (ORDER_STAGES[currentIdx]?.label || order.status || '—')}</Text>
        </Text>

        {!rejected && (
          <TouchableOpacity onPress={rejectOrder} style={{ paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: '#B91C1C', fontWeight: '900', fontSize: 13 }}>Reject order</Text>
          </TouchableOpacity>
        )}

        {/* Items */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Items</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
          {(order.items || []).map((it: any, idx: number) => (
            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: idx < order.items.length - 1 ? 1 : 0, borderBottomColor: '#f1f5f9' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>{it.name}</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>x{it.quantity} · ₹{it.price}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#1A1A1A' }}>₹{((it.price || 0) * (it.quantity || 0)).toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Invoice lines edit modal — batch_no + expiry_date per line */}
      {showLines && invoice && (
        <AdminInvoiceLinesModal
          orderId={order.id}
          items={invItems}
          onClose={() => setShowLines(false)}
          onSaved={() => { setShowLines(false); loadInvoice(); }}
        />
      )}

      {/* Dispatch modal — capture courier + tracking id before advancing */}
      {showDispatch && (
        <AdminDispatchModal
          existing={{ courier_name: order.courier_name || '', tracking_id: order.tracking_id || '' }}
          onClose={() => setShowDispatch(false)}
          onConfirm={async (payload) => {
            setShowDispatch(false);
            await setStage('Dispatch', payload);
          }}
        />
      )}
    </View>
  );
}

function AdminInvoiceLinesModal({ orderId, items, onClose, onSaved }: any) {
  const [rows, setRows] = useState(() => items.map((it: any) => ({
    id: it.id,
    product_name: it.product_name,
    quantity: it.quantity,
    batch_no: it.batch_no || '',
    expiry_date: it.expiry_date || '',
  })));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/invoices/${encodeURIComponent(orderId)}/lines`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ lines: rows.map((r: any) => ({ id: r.id, batch_no: r.batch_no || null, expiry_date: r.expiry_date || null })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('Batch / expiry saved', 'success');
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#F7FAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: '#1A1A1A' }}>Edit invoice lines</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 12 }}>
              Set batch number + expiry per SKU. Only editable while invoice is Draft.
            </Text>
            {rows.map((row: any, i: number) => (
              <View key={row.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>{row.product_name}</Text>
                <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700', marginBottom: 8 }}>Qty: {row.quantity}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Batch #</Text>
                    <TextInput
                      value={row.batch_no}
                      onChangeText={(v) => { const next = [...rows]; next[i] = { ...next[i], batch_no: v }; setRows(next); }}
                      placeholder="B12345"
                      placeholderTextColor="#94a3b8"
                      style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: '700', color: '#0f172a' }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Expiry (YYYY-MM-DD)</Text>
                    <TextInput
                      value={row.expiry_date}
                      onChangeText={(v) => { const next = [...rows]; next[i] = { ...next[i], expiry_date: v }; setRows(next); }}
                      placeholder="2027-06-30"
                      placeholderTextColor="#94a3b8"
                      style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: '700', color: '#0f172a' }}
                    />
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity disabled={busy} onPress={save} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Saving…' : 'Save all lines'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AdminDispatchModal({ existing, onClose, onConfirm }: any) {
  const [courier, setCourier] = useState(existing.courier_name || '');
  const [tracking, setTracking] = useState(existing.tracking_id || '');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!courier.trim() || !tracking.trim()) {
      Alert.alert('Missing info', 'Courier name and tracking ID are both required.');
      return;
    }
    setBusy(true);
    await onConfirm({ courier_name: courier.trim(), tracking_id: tracking.trim() });
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#F7FAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: '#1A1A1A' }}>Dispatch order</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 16 }}>
            Enter courier + tracking so the customer gets a proper push notification.
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Courier</Text>
          <TextInput value={courier} onChangeText={setCourier} placeholder="Bluedart / DTDC / Delhivery…" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 12 }} />
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Tracking ID</Text>
          <TextInput value={tracking} onChangeText={setTracking} placeholder="AWB / Docket #" placeholderTextColor="#94a3b8" autoCapitalize="characters" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 20 }} />
          <TouchableOpacity disabled={busy} onPress={confirm} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Dispatching…' : 'Confirm dispatch'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// --- Admin Products list + edit form (multi-image URL entry) ---
function AdminProductsScreen({ onBack, onEditProduct, onAddProduct, onRefresh }) {
  const products = useStore((s) => s.products) || [];
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  // Category filter — defaults to Derma so the launch catalog is what admin
  // sees first. The DB still holds the legacy SQLite-migrated products
  // (mostly non-Derma), which the admin can access via the 'All' chip.
  const [catFilter, setCatFilter] = useState<'Derma' | 'all'>(DERMA_ONLY ? 'Derma' : 'all');

  const searchable = catFilter === 'all' ? products : products.filter((p: any) => p.category === catFilter);
  const filtered = q
    ? searchable.filter((p: any) => (p.name + ' ' + (p.company || '') + ' ' + (p.body_system || '')).toLowerCase().includes(q.toLowerCase()))
    : searchable;

  const dermaCount = products.filter((p: any) => p.category === 'Derma').length;

  // Pick an Excel/CSV and POST it as multipart/form-data to /api/upload.
  // The server-side route already handles: MIME + size caps (10 MB / xls/xlsx/csv),
  // admin auth, column autodetection, batched inserts, and dedupe by name.
  const bulkUpload = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });
      if (pick.canceled || !pick.assets?.[0]) return;
      const file = pick.assets[0];
      if (file.size && file.size > 10 * 1024 * 1024) {
        Alert.alert('File too large', 'Max 10 MB. Split the sheet or filter it first.');
        return;
      }
      setUploading(true);

      // React Native FormData: pass { uri, name, type } for the file field.
      const form = new FormData();
      form.append('type', 'products');
      form.append('file', ({ uri: file.uri, name: file.name || 'products.xlsx', type: file.mimeType || 'application/octet-stream' }) as any);

      const url = `${useStore.getState().getBaseUrl()}/api/upload`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          // Don't set Content-Type manually — RN sets the multipart boundary.
          ...Object.fromEntries(
            Object.entries(useStore.getState().authHeaders()).filter(([k]) => k.toLowerCase() !== 'content-type')
          ),
        } as any,
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      Alert.alert('Uploaded', `${data.added || 0} SKU${data.added === 1 ? '' : 's'} added / updated.`);
      if (onRefresh) onRefresh();
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Try again');
    }
    setUploading(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader
        title="Products"
        subtitle={`${filtered.length} of ${searchable.length} · ${catFilter === 'Derma' ? 'Derma catalog' : 'All categories'}`}
        onBack={onBack}
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity disabled={uploading} onPress={bulkUpload} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: uploading ? '#94a3b8' : '#0EA5E9' }}>
              <Ionicons name={uploading ? 'sync' : 'cloud-upload-outline'} size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{uploading ? 'Uploading…' : 'Bulk'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onAddProduct} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: BRAND[800] }}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Add</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        {/* Category filter — Derma vs everything. Derma is the launch catalog
            (203 SKUs). 'All' also surfaces the ~5,900 legacy SKUs migrated
            from SQLite that aren't part of the pilot. */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => setCatFilter('Derma')}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: catFilter === 'Derma' ? BRAND[800] : '#f1f5f9' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '900', color: catFilter === 'Derma' ? '#fff' : '#475569' }}>Derma ({dermaCount})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCatFilter('all')}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: catFilter === 'all' ? BRAND[800] : '#f1f5f9' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '900', color: catFilter === 'all' ? '#fff' : '#475569' }}>All ({products.length})</Text>
          </TouchableOpacity>
        </View>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" />
          <TextInput placeholder="Search SKUs" placeholderTextColor="#94a3b8" value={q} onChangeText={setQ}
            style={{ flex: 1, padding: 12, fontSize: 14, color: '#1A1A1A', fontWeight: '600' }}
          />
        </View>
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={filtered}
        keyExtractor={(p: any) => String(p.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => onEditProduct(item)}
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' }}
          >
            <Image source={{ uri: getProductImages(item)[0] }} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#f1f5f9', marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }} numberOfLines={1}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }} numberOfLines={1}>{item.company} · {item.category}</Text>
              <Text style={{ fontSize: 12, color: BRAND[700], fontWeight: '900', marginTop: 2 }}>₹{item.price_ptr || item.price}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: item.stock < 10 ? '#dc2626' : '#64748b', fontWeight: '800' }}>{item.stock || 0} in stock</Text>
              {item.short_expiry ? (
                <View style={{ marginTop: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ color: '#B45309', fontSize: 9, fontWeight: '900' }}>SHORT EXP</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60 }}><Text style={{ color: '#64748b' }}>No products match your search.</Text></View>}
      />
    </View>
  );
}

function AdminProductEditScreen({ product, onBack, onSaved }) {
  const editing = !!product?.id;
  const [form, setForm] = useState<any>({
    id: product?.id,
    name: product?.name || '',
    company: product?.company || '',
    category: product?.category || 'General',
    packing: product?.packing || '1×10',
    price_ptr: String(product?.price_ptr ?? product?.price ?? ''),
    mrp: String(product?.mrp ?? ''),
    stock: String(product?.stock ?? 0),
    composition: product?.composition || '',
    description: product?.description || '',
    short_expiry: !!product?.short_expiry,
    discount_percent: String(product?.discount_percent ?? ''),
    expiry_date: product?.expiry_date || '',
    images: Array.isArray(product?.images) && product.images.length > 0 ? [...product.images] : (product?.image ? [product.image] : []),
  });
  const [busy, setBusy] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const addImage = () => {
    const clean = urlInput.trim();
    if (!clean) return;
    setForm({ ...form, images: [...form.images, clean] });
    setUrlInput('');
  };
  const removeImage = (i: number) => {
    const next = form.images.slice();
    next.splice(i, 1);
    setForm({ ...form, images: next });
  };

  // Upload state: prevents double-tap while a photo is in-flight.
  const [uploading, setUploading] = useState(false);

  // Upload a picked photo (URI from ImagePicker) to /api/admin/product-image
  // and append the returned public URL to form.images. FormData in React
  // Native accepts { uri, name, type } which the fetch layer converts to a
  // multipart boundary automatically — do NOT set Content-Type ourselves.
  const uploadPickedPhoto = async (uri: string, mimeGuess: string) => {
    setUploading(true);
    try {
      const filename = `product-${Date.now()}.${mimeGuess.split('/')[1] || 'jpg'}`;
      const fd = new FormData();
      fd.append('file', ({ uri, name: filename, type: mimeGuess } as unknown) as Blob);
      const url = `${useStore.getState().getBaseUrl()}/api/admin/product-image`;
      const authHeaders = useStore.getState().authHeaders();
      // Strip Content-Type so RN sets the multipart boundary itself.
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(authHeaders)) {
        if (k.toLowerCase() !== 'content-type') headers[k] = v;
      }
      const res = await fetch(url, { method: 'POST', headers, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setForm((f: any) => ({ ...f, images: [...f.images, data.url] }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Photo uploaded', 'success');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Try again in a moment.');
    }
    setUploading(false);
  };

  // Camera → capture single photo → upload.
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable camera permission in Settings to take product photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await uploadPickedPhoto(asset.uri, asset.mimeType || 'image/jpeg');
  };

  // Gallery → pick 1+ photos → upload each.
  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Enable photo library permission in Settings to attach product images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    for (const asset of result.assets) {
      await uploadPickedPhoto(asset.uri, asset.mimeType || 'image/jpeg');
    }
  };

  const save = async () => {
    if (!form.name || !form.price_ptr) return Alert.alert('Missing', 'Name and PTR price are required.');
    setBusy(true);
    try {
      const url = useStore.getState().getApiUrl();
      const payload = {
        ...form,
        price_ptr: parseFloat(form.price_ptr) || 0,
        price: parseFloat(form.price_ptr) || 0,
        mrp: form.mrp ? parseFloat(form.mrp) : undefined,
        stock: parseInt(form.stock, 10) || 0,
        discount_percent: form.discount_percent ? parseInt(form.discount_percent, 10) : 0,
      };
      const action = editing ? 'update_product' : 'add_product';
      const collection = 'products';
      const res = await fetch(url, {
        method: 'POST',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ collection, action, item: payload }),
      });
      if (!res.ok) {
        // Don't do the optimistic update — if the server rejected the save,
        // showing the change locally only to have it wiped by the next 5s
        // poll is worse than surfacing the error immediately.
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Save failed (${res.status})`);
      }
      // Optimistic local update
      const products = useStore.getState().products || [];
      let next;
      if (editing) {
        next = products.map((p: any) => p.id === form.id ? { ...p, ...payload } : p);
      } else {
        const newId = Math.max(0, ...products.map((p: any) => Number(p.id) || 0)) + 1;
        next = [{ ...payload, id: newId }, ...products];
      }
      useStore.getState().setProducts(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(editing ? 'Product updated' : 'Product added');
      onSaved && onSaved();
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
    setBusy(false);
  };

  const del = () => {
    if (!editing) return;
    Alert.alert('Delete product', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const url = useStore.getState().getApiUrl();
          const res = await fetch(url, {
            method: 'POST',
            headers: useStore.getState().authHeaders(),
            body: JSON.stringify({ collection: 'products', action: 'delete_product', item: { id: form.id } }),
          });
          if (!res.ok) throw new Error(`Delete failed (${res.status})`);
          const products = (useStore.getState().products || []).filter((p: any) => p.id !== form.id);
          useStore.getState().setProducts(products);
          showToast('Deleted', 'info');
          onSaved && onSaved();
        } catch {
          Alert.alert('Error', 'Delete failed.');
        }
      }},
    ]);
  };

  const inputStyle = { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 12, borderRadius: 12, fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 10 };
  const labelStyle = { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F7FAF8' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title={editing ? 'Edit product' : 'Add product'} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Images section */}
        <Text style={labelStyle}>Photos</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' }}>
          {form.images.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
              {form.images.map((uri: string, i: number) => (
                <View key={i} style={{ position: 'relative' }}>
                  <Image source={{ uri }} style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#f1f5f9' }} />
                  <TouchableOpacity onPress={() => removeImage(i)} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#dc2626', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <Ionicons name="images-outline" size={24} color="#94a3b8" />
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginTop: 6 }}>No photos yet</Text>
            </View>
          )}
          {/* Camera + Gallery — main upload path for shop admins */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              disabled={uploading}
              onPress={takePhoto}
              style={{ flex: 1, backgroundColor: BRAND[800], paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={16} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={uploading}
              onPress={pickFromGallery}
              style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BRAND[800], paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: uploading ? 0.6 : 1 }}
            >
              <Ionicons name="images" size={16} color={BRAND[800]} />
              <Text style={{ color: BRAND[800], fontSize: 13, fontWeight: '900' }}>From gallery</Text>
            </TouchableOpacity>
          </View>
          {/* URL fallback — still works for admins who have a hosted image */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="Or paste image URL"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 10, borderRadius: 10, fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}
            />
            <TouchableOpacity onPress={addImage} style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' }}>
              <Text style={{ color: '#475569', fontWeight: '900', fontSize: 12 }}>Add</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 8, fontSize: 10, color: '#94a3b8', fontWeight: '600' }}>
            Photos upload to secure storage. First photo becomes the main image customers see.
          </Text>
        </View>

        <Text style={labelStyle}>Name</Text>
        <TextInput value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} style={inputStyle} placeholder="Product name" placeholderTextColor="#94a3b8" />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Company</Text>
            <TextInput value={form.company} onChangeText={(t) => setForm({ ...form, company: t })} style={inputStyle} placeholder="Mfr" placeholderTextColor="#94a3b8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Category</Text>
            <TextInput value={form.category} onChangeText={(t) => setForm({ ...form, category: t })} style={inputStyle} placeholder="e.g. Antibiotics" placeholderTextColor="#94a3b8" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>PTR price ₹</Text>
            <TextInput value={form.price_ptr} onChangeText={(t) => setForm({ ...form, price_ptr: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" style={inputStyle} placeholder="0" placeholderTextColor="#94a3b8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>MRP ₹</Text>
            <TextInput value={form.mrp} onChangeText={(t) => setForm({ ...form, mrp: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" style={inputStyle} placeholder="0" placeholderTextColor="#94a3b8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Stock</Text>
            <TextInput value={form.stock} onChangeText={(t) => setForm({ ...form, stock: t.replace(/[^0-9]/g, '') })} keyboardType="number-pad" style={inputStyle} placeholder="0" placeholderTextColor="#94a3b8" />
          </View>
        </View>

        <Text style={labelStyle}>Packing</Text>
        <TextInput value={form.packing} onChangeText={(t) => setForm({ ...form, packing: t })} style={inputStyle} placeholder="e.g. 1×10" placeholderTextColor="#94a3b8" />

        <Text style={labelStyle}>Composition</Text>
        <TextInput value={form.composition} onChangeText={(t) => setForm({ ...form, composition: t })} style={inputStyle} placeholder="Active ingredients" placeholderTextColor="#94a3b8" />

        <Text style={labelStyle}>Description</Text>
        <TextInput value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} style={[inputStyle, { height: 90, textAlignVertical: 'top' }]} multiline placeholder="Usage & notes" placeholderTextColor="#94a3b8" />

        {/* Short expiry + discount */}
        <View style={{ backgroundColor: '#FFF7ED', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#FED7AA', marginBottom: 12 }}>
          <TouchableOpacity onPress={() => setForm({ ...form, short_expiry: !form.short_expiry })} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: form.short_expiry ? '#B45309' : '#FED7AA', backgroundColor: form.short_expiry ? '#F59E0B' : 'transparent', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              {form.short_expiry && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#B45309' }}>Short expiry offer</Text>
              <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>Shown in the "Short expiry" filter and homepage banner</Text>
            </View>
          </TouchableOpacity>
          {form.short_expiry && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Discount %</Text>
                <TextInput value={form.discount_percent} onChangeText={(t) => setForm({ ...form, discount_percent: t.replace(/[^0-9]/g, '').slice(0, 2) })} keyboardType="number-pad" style={inputStyle} placeholder="0" placeholderTextColor="#94a3b8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Expiry date</Text>
                <TextInput value={form.expiry_date} onChangeText={(t) => setForm({ ...form, expiry_date: t })} style={inputStyle} placeholder="MM/YYYY" placeholderTextColor="#94a3b8" />
              </View>
            </View>
          )}
        </View>

        {/* Save / delete */}
        <TouchableOpacity onPress={save} disabled={busy} style={{ backgroundColor: BRAND[800], paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 6, ...SHADOWS.glowGreen }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Add product')}</Text>
        </TouchableOpacity>
        {editing && (
          <TouchableOpacity onPress={del} style={{ paddingVertical: 14, alignItems: 'center', marginTop: 10 }}>
            <Text style={{ color: '#dc2626', fontWeight: '800' }}>Delete product</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Admin Credit Requests (approve/reject a partner's ask for more credit) ---
function AdminCreditRequestsScreen({ onBack }: any) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'Approved' | 'Rejected' | 'all'>('Pending');

  const load = async () => {
    setLoading(true);
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/credit-requests`;
      const res = await useStore.getState().authFetch(url);
      const data = await res.json();
      const all = data.requests || [];
      setRequests(statusFilter === 'all' ? all : all.filter((r: any) => r.status === statusFilter));
    } catch {
      Alert.alert('Error', 'Could not load credit requests');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const patch = async (id: any, action: 'approve' | 'reject', adminNote?: string) => {
    setBusyId(id);
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/credit-requests/${id}`;
      const res = await useStore.getState().authFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ action, admin_note: adminNote || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Request ${action}d`, action === 'approve' ? 'success' : 'info');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setBusyId(null);
  };

  const promptReject = (id: any) => {
    Alert.prompt?.('Reject credit request', 'Optional note for the customer', (note) => {
      patch(id, 'reject', note || undefined);
    }) ?? patch(id, 'reject');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader
        title="Credit requests"
        subtitle={`${requests.length} ${statusFilter.toLowerCase()}`}
        onBack={onBack}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', gap: 6 }}>
        {(['Pending', 'Approved', 'Rejected', 'all'] as const).map((s) => {
          const active = statusFilter === s;
          return (
            <TouchableOpacity key={s} onPress={() => setStatusFilter(s)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? BRAND[800] : '#f1f5f9' }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: active ? '#fff' : '#475569' }}>{s === 'all' ? 'All' : s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={requests}
        keyExtractor={(r: any) => String(r.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="wallet-outline" size={30} color={BRAND[700]} />
            </View>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900' }}>No credit requests</Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Partners haven't asked for more credit.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          const isPending = item.status === 'Pending';
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                  <Text style={{ color: BRAND[800], fontSize: 14, fontWeight: '900' }}>{item.store_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }} numberOfLines={1}>{item.store_name || 'Unknown partner'}</Text>
                  <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700' }}>+91 {item.phone || '—'} · {new Date(item.requested_at).toLocaleDateString()}</Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                  backgroundColor: item.status === 'Approved' ? BRAND[100] : item.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
                    color: item.status === 'Approved' ? BRAND[800] : item.status === 'Rejected' ? '#B91C1C' : '#B45309',
                  }}>{item.status?.toUpperCase()}</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Amount requested</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: BRAND[800], marginTop: 2 }}>
                  +₹{Number(item.amount).toLocaleString('en-IN')}
                </Text>
                {item.note ? (
                  <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', fontStyle: 'italic', marginTop: 8 }}>
                    “{item.note}”
                  </Text>
                ) : null}
              </View>

              {item.admin_note ? (
                <View style={{ backgroundColor: '#F1F5F9', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Admin note</Text>
                  <Text style={{ fontSize: 12, color: '#475569', fontWeight: '700' }}>{item.admin_note}</Text>
                </View>
              ) : null}

              {isPending && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => promptReject(item.id)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#FCA5A5' }}
                  >
                    <Text style={{ color: '#B91C1C', fontWeight: '900', fontSize: 13 }}>{busy ? '…' : 'Reject'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => patch(item.id, 'approve')}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: BRAND[800] }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{busy ? '…' : `Approve +₹${Number(item.amount).toLocaleString('en-IN')}`}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

// --- Admin Profile Change Requests (approve / reject) ---
function AdminChangeRequestsScreen({ onBack }: any) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'Approved' | 'Rejected' | 'all'>('Pending');
  const usersList = useStore((s) => s.usersList) || [];

  const load = async () => {
    setLoading(true);
    try {
      const qs = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
      const url = `${useStore.getState().getBaseUrl()}/api/profile-change-requests${qs}`;
      const res = await fetch(url, { headers: useStore.getState().authHeaders() });
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      Alert.alert('Error', 'Could not load requests');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const patch = async (id: any, action: 'approve' | 'reject', note?: string) => {
    setBusyId(id);
    try {
      const url = `${useStore.getState().getBaseUrl()}/api/profile-change-requests`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ id, action, note: note || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(`Request ${action}d`, action === 'approve' ? 'success' : 'info');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setBusyId(null);
  };

  const findUser = (uid: string) => usersList.find((u: any) => u.id === uid);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader
        title="Change requests"
        subtitle={`${requests.length} ${statusFilter.toLowerCase()}`}
        onBack={onBack}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', gap: 6 }}>
        {(['Pending', 'Approved', 'Rejected', 'all'] as const).map((s) => {
          const active = statusFilter === s;
          return (
            <TouchableOpacity key={s} onPress={() => setStatusFilter(s)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? BRAND[800] : '#f1f5f9' }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: active ? '#fff' : '#475569' }}>{s === 'all' ? 'All' : s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={requests}
        keyExtractor={(r: any) => String(r.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: BRAND[50], justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="checkmark-done" size={30} color={BRAND[700]} />
            </View>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900' }}>Nothing to review</Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Partners haven't asked for any changes.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const user = findUser(item.user_id);
          const busy = busyId === item.id;
          const isPending = item.status === 'Pending';
          const changes = item.changes || {};
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                  <Text style={{ color: BRAND[800], fontSize: 14, fontWeight: '900' }}>{user?.store_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }} numberOfLines={1}>{user?.store_name || 'Unknown partner'}</Text>
                  <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700' }}>+91 {user?.phone || '—'} · {new Date(item.requested_at).toLocaleDateString()}</Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                  backgroundColor: item.status === 'Approved' ? BRAND[100] : item.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
                    color: item.status === 'Approved' ? BRAND[800] : item.status === 'Rejected' ? '#B91C1C' : '#B45309',
                  }}>{item.status?.toUpperCase()}</Text>
                </View>
              </View>

              {/* Diff */}
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                {Object.keys(changes).length === 0 ? (
                  <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '700' }}>No fields</Text>
                ) : Object.entries(changes).map(([k, v]) => {
                  const current = (user as any)?.[k] || '—';
                  return (
                    <View key={k} style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.replace(/_/g, ' ')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
                        <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700', textDecorationLine: 'line-through' }} numberOfLines={1}>{current}</Text>
                        <Ionicons name="arrow-forward" size={12} color="#94a3b8" />
                        <Text style={{ fontSize: 12, color: BRAND[800], fontWeight: '900', flex: 1 }} numberOfLines={2}>{String(v)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {item.reason ? (
                <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', fontStyle: 'italic', marginBottom: 12 }}>
                  Partner's note: {item.reason}
                </Text>
              ) : null}

              {item.admin_note ? (
                <View style={{ backgroundColor: '#F1F5F9', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Admin note</Text>
                  <Text style={{ fontSize: 12, color: '#475569', fontWeight: '700' }}>{item.admin_note}</Text>
                </View>
              ) : null}

              {isPending && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => Alert.prompt
                      ? Alert.prompt('Reject reason', 'Optional note visible to the partner', (note) => patch(item.id, 'reject', note || undefined))
                      : patch(item.id, 'reject')
                    }
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#B91C1C', fontWeight: '900', fontSize: 12 }}>{busy ? '…' : 'Reject'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => patch(item.id, 'approve')}
                    style={{ flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND[800], alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{busy ? 'Working…' : 'Approve'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

// --- Admin Notifications (broadcast) ---
function AdminNotificationsScreen({ onBack }: any) {
  const usersList = useStore((s) => s.usersList) || [];
  const partners = usersList.filter((u: any) => u.role !== 'admin' && u.is_approved && !u.is_blocked);
  const [target, setTarget] = useState<'all' | 'user'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [q, setQ] = useState('');

  const selectedUser = partners.find((u: any) => u.id === selectedUserId);

  const send = async () => {
    if (!title.trim() || !msg.trim()) {
      Alert.alert('Missing info', 'Both title and message are required.');
      return;
    }
    if (target === 'user' && !selectedUserId) {
      Alert.alert('Pick a partner', 'Choose which partner to notify.');
      return;
    }
    Alert.alert(
      `Send to ${target === 'all' ? partners.length + ' partners' : selectedUser?.store_name}?`,
      'This will send an in-app + push notification immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: async () => {
          setBusy(true);
          try {
            const url = `${useStore.getState().getBaseUrl()}/api/notifications`;
            const res = await fetch(url, {
              method: 'POST',
              headers: useStore.getState().authHeaders(),
              body: JSON.stringify({
                target,
                user_id: target === 'user' ? selectedUserId : undefined,
                title: title.trim(),
                body: msg.trim(),
                type: 'admin_broadcast',
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            showToast(`Delivered to ${data.delivered || 0} partner${data.delivered === 1 ? '' : 's'}`, 'success');
            setTitle(''); setMsg('');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
          setBusy(false);
        }},
      ]
    );
  };

  const filteredPartners = q
    ? partners.filter((u: any) => (u.store_name || '').toLowerCase().includes(q.toLowerCase()) || (u.phone || '').includes(q))
    : partners;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title="Notifications" subtitle="Broadcast to partners" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Target */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Send to</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {([
            { k: 'all',  label: `All partners (${partners.length})`, icon: 'megaphone-outline' },
            { k: 'user', label: 'One partner', icon: 'person-outline' },
          ] as const).map((opt) => {
            const active = target === opt.k;
            return (
              <TouchableOpacity key={opt.k} onPress={() => setTarget(opt.k)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: active ? BRAND[800] : '#fff', borderWidth: 1, borderColor: active ? BRAND[800] : '#e2e8f0', alignItems: 'center', gap: 4 }}>
                <Ionicons name={opt.icon as any} size={18} color={active ? '#fff' : BRAND[800]} />
                <Text style={{ fontSize: 12, fontWeight: '900', color: active ? '#fff' : '#475569' }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {target === 'user' && (
          <TouchableOpacity onPress={() => setShowPicker(true)} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Partner</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: selectedUser ? '#0f172a' : '#94a3b8', marginTop: 2 }}>
                {selectedUser ? `${selectedUser.store_name} (${selectedUser.phone})` : 'Tap to select…'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}

        {/* Title */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Title</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="New Derma launch discount" placeholderTextColor="#94a3b8" maxLength={80} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 }} />

        {/* Body */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Message</Text>
        <TextInput value={msg} onChangeText={setMsg} placeholder="Use code DERMA10 for 10% off your first order on Derma products." placeholderTextColor="#94a3b8" multiline maxLength={280} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, fontWeight: '600', color: '#0f172a', minHeight: 100, marginBottom: 4 }} />
        <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700', marginBottom: 16, textAlign: 'right' }}>{msg.length} / 280</Text>

        <TouchableOpacity disabled={busy} onPress={send} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {busy && <ActivityIndicator color="#fff" size="small" />}
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Sending…' : `Send notification`}</Text>
        </TouchableOpacity>

        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 20 }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: '#B45309', letterSpacing: 0.5 }}>⚡ HEADS UP</Text>
          <Text style={{ fontSize: 12, color: '#78350F', fontWeight: '700', marginTop: 4 }}>
            Broadcasts hit every approved, non-blocked partner. Push delivery depends on the partner having opened the app at least once to register their Expo token.
          </Text>
        </View>
      </ScrollView>

      {/* Partner picker */}
      {showPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#F7FAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: '#1A1A1A' }}>Select partner</Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}><Ionicons name="close" size={22} color="#475569" /></TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}>
                  <Ionicons name="search" size={16} color="#94a3b8" />
                  <TextInput value={q} onChangeText={setQ} placeholder="Search…" placeholderTextColor="#94a3b8" style={{ flex: 1, padding: 10, fontSize: 14, fontWeight: '600', color: '#0f172a' }} />
                </View>
              </View>
              <FlatList
                data={filteredPartners}
                keyExtractor={(u: any) => String(u.id || u.phone)}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => { setSelectedUserId(item.id); setShowPicker(false); setQ(''); }}
                    style={{ backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center' }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }}>{item.store_name}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700' }}>+91 {item.phone}</Text>
                    </View>
                    {item.expo_push_token ? <Ionicons name="notifications" size={14} color={BRAND[700]} /> : <Ionicons name="notifications-off-outline" size={14} color="#94a3b8" />}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// --- Admin Analytics ---
// Derives everything from the store (orders + products + usersList) so no
// extra API is needed. Charts are hand-rolled with Views to avoid pulling
// in a native charting library that'd break Expo Go.
function AdminAnalyticsScreen({ onBack }: any) {
  const orders = useStore((s) => s.orders) || [];
  const products = useStore((s) => s.products) || [];
  const usersList = useStore((s) => s.usersList) || [];
  const schemes = useStore((s) => s.schemes) || [];

  const partners = usersList.filter((u: any) => u.role !== 'admin');
  const pendingApprovals = partners.filter((u: any) => !u.is_approved).length;
  const activePartners = partners.filter((u: any) => u.is_approved && !u.is_blocked).length;

  const nonRejected = orders.filter((o: any) => !/reject/i.test(o.status || ''));
  const totalRevenue = nonRejected.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
  const dispatched = orders.filter((o: any) => /dispatch/i.test(o.status || '')).length;
  const rejected = orders.filter((o: any) => /reject/i.test(o.status || '')).length;
  const aov = nonRejected.length ? Math.round(totalRevenue / nonRejected.length) : 0;
  const fulfillmentPct = orders.length ? Math.round((dispatched / orders.length) * 100) : 0;
  const rejectionPct = orders.length ? Math.round((rejected / orders.length) * 100) : 0;

  // Last-7-day revenue buckets
  const now = new Date();
  const buckets = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now); d.setDate(now.getDate() - (6 - i));
    const key = d.toLocaleDateString('en-GB'); // matches order.date format
    return { key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), revenue: 0, count: 0 };
  });
  for (const o of nonRejected) {
    const b = buckets.find((b) => b.key === o.date);
    if (b) { b.revenue += Number(o.total) || 0; b.count += 1; }
  }
  const maxBucket = Math.max(1, ...buckets.map((b) => b.revenue));

  // Top products by quantity
  const skuMap = new Map<string, { name: string; qty: number }>();
  for (const o of nonRejected) {
    for (const it of (o.items || [])) {
      const key = String(it.id ?? it.name);
      const cur = skuMap.get(key) || { name: it.name, qty: 0 };
      cur.qty += Number(it.quantity) || 0;
      skuMap.set(key, cur);
    }
  }
  const topProducts = Array.from(skuMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const KPI = ({ label, value, sub, color }: any) => (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', ...SHADOWS.sm }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '900', color: color || '#1A1A1A', marginTop: 4, letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', marginTop: 2 }}>{sub}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title="Analytics" subtitle="Business overview" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* KPI row 1 */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <KPI label="Revenue" value={`₹${(totalRevenue / 1000).toFixed(1)}k`} sub="Non-rejected orders" color={BRAND[800]} />
          <KPI label="Orders" value={orders.length} sub={`${nonRejected.length} verified`} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <KPI label="Partners" value={activePartners} sub={`${pendingApprovals} pending`} color="#0EA5E9" />
          <KPI label="AOV" value={`₹${aov.toLocaleString('en-IN')}`} sub="Avg order value" />
        </View>

        {/* Revenue trend */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A' }}>Last 7 days</Text>
          <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700', marginBottom: 12 }}>Revenue per day, non-rejected only</Text>
          {buckets.map((b) => {
            const pct = (b.revenue / maxBucket) * 100;
            return (
              <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ width: 36, fontSize: 11, fontWeight: '800', color: '#64748b' }}>{b.label}</Text>
                <View style={{ flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND[700], borderRadius: 4 }} />
                </View>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: '900', color: '#0f172a' }}>
                  {b.revenue > 0 ? `₹${(b.revenue / 1000).toFixed(1)}k` : '—'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Order pipeline */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A', marginBottom: 10 }}>Order pipeline</Text>
          {[
            { label: 'Invoicing', count: orders.filter((o: any) => /invoic/i.test(o.status || '')).length, color: '#F59E0B' },
            { label: 'Packaging', count: orders.filter((o: any) => /pack/i.test(o.status || '')).length, color: '#0EA5E9' },
            { label: 'Dispatched', count: dispatched, color: BRAND[700] },
            { label: 'Rejected', count: rejected, color: '#EF4444' },
          ].map((row) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: row.color, marginRight: 10 }} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{row.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A' }}>{row.count}</Text>
            </View>
          ))}
          <View style={{ marginTop: 10, backgroundColor: BRAND[50], borderRadius: 10, padding: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Fulfilment {fulfillmentPct}% · Rejection {rejectionPct}%</Text>
          </View>
        </View>

        {/* Top products */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#1A1A1A' }}>Top 5 SKUs by quantity</Text>
          <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700', marginBottom: 10 }}>Across all verified orders</Text>
          {topProducts.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '700', textAlign: 'center', paddingVertical: 20 }}>No sales yet</Text>
          ) : topProducts.map((p, i) => (
            <View key={p.name + i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ width: 26, fontSize: 11, fontWeight: '900', color: '#94a3b8' }}>#{i + 1}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND[700] }}>{p.qty}</Text>
            </View>
          ))}
        </View>

        {/* Catalog + schemes summary */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <KPI label="Catalog" value={products.length.toLocaleString('en-IN')} sub="Total SKUs" />
          <KPI label="Schemes" value={schemes.filter((s: any) => s.is_active).length} sub={`${schemes.length} total`} color="#059669" />
        </View>
      </ScrollView>
    </View>
  );
}

// --- Admin Schemes (B2B coupons) ---
function AdminSchemesScreen({ onBack }: any) {
  const [schemes, setSchemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);   // null = closed, object = edit, {} = new

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(useStore.getState().getSchemesUrl(), {
        headers: useStore.getState().authHeaders(),
      });
      const data = await res.json();
      setSchemes(data.schemes || []);
    } catch {
      Alert.alert('Error', 'Could not load schemes');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (s: any) => {
    Haptics.selectionAsync();
    try {
      await fetch(useStore.getState().getSchemesUrl(), {
        method: 'PUT',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify({ id: s.id, action: 'toggle' }),
      });
      load();
    } catch {
      Alert.alert('Error', 'Could not toggle scheme');
    }
  };

  const remove = async (s: any) => {
    Alert.alert('Delete scheme?', `${s.title} (${s.code}) will be removed. Existing orders that used it are preserved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await fetch(`${useStore.getState().getSchemesUrl()}?id=${s.id}`, {
            method: 'DELETE',
            headers: useStore.getState().authHeaders(),
          });
          showToast('Scheme deleted', 'info');
          load();
        } catch {
          Alert.alert('Error', 'Could not delete');
        }
      }},
    ]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader
        title="Schemes"
        subtitle={`${schemes.length} total`}
        onBack={onBack}
        right={
          <TouchableOpacity onPress={() => setEditing({})} style={{ backgroundColor: BRAND[800], paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>New</Text>
          </TouchableOpacity>
        }
      />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={schemes}
        keyExtractor={(s: any) => String(s.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="pricetag-outline" size={36} color="#cbd5e1" />
            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700', marginTop: 10 }}>No schemes yet</Text>
            <TouchableOpacity onPress={() => setEditing({})} style={{ marginTop: 16, backgroundColor: BRAND[800], paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>Create first scheme</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const today = new Date().toISOString().split('T')[0];
          const expired = item.end_date && item.end_date < today;
          const notYet  = item.start_date && item.start_date > today;
          const running = item.is_active && !expired && !notYet;
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: running ? BRAND[200] : '#f1f5f9', ...SHADOWS.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#1A1A1A' }}>{item.title || 'Untitled'}</Text>
                    <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: '#475569', letterSpacing: 0.5 }}>{item.code}</Text>
                    </View>
                    {running && <View style={{ backgroundColor: BRAND[100], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '900', color: BRAND[800] }}>LIVE</Text></View>}
                    {!item.is_active && <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '900', color: '#94a3b8' }}>OFF</Text></View>}
                    {expired && <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '900', color: '#B91C1C' }}>EXPIRED</Text></View>}
                    {notYet && <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '900', color: '#B45309' }}>UPCOMING</Text></View>}
                  </View>
                  <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 4 }} numberOfLines={2}>{item.description || '—'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: BRAND[700], fontWeight: '900' }}>
                      {item.scheme_type === 'Flat' ? `₹${item.flat_discount} off` : `${item.discount_percent || 0}% off`}
                      {item.max_discount ? ` · max ₹${item.max_discount}` : ''}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700' }}>· Min ₹{item.min_order_value || 0}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700', marginTop: 2 }}>
                    {item.start_date} → {item.end_date} · per user {item.per_user_limit || 0}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={() => toggle(item)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: item.is_active ? '#f1f5f9' : BRAND[100], alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: item.is_active ? '#475569' : BRAND[800] }}>{item.is_active ? 'Deactivate' : 'Activate'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditing(item)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#475569' }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center' }}>
                  <Ionicons name="trash-outline" size={16} color="#B91C1C" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
      {editing !== null && (
        <AdminSchemeEditModal
          scheme={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </View>
  );
}

function AdminSchemeEditModal({ scheme, onClose, onSaved }: any) {
  const isNew = !scheme;
  const [form, setForm] = useState({
    title: scheme?.title || '',
    description: scheme?.description || '',
    code: scheme?.code || '',
    scheme_type: scheme?.scheme_type || 'Discount',
    discount_percent: String(scheme?.discount_percent ?? ''),
    flat_discount: String(scheme?.flat_discount ?? ''),
    max_discount: String(scheme?.max_discount ?? ''),
    min_order_value: String(scheme?.min_order_value ?? '0'),
    per_user_limit: String(scheme?.per_user_limit ?? '1'),
    start_date: scheme?.start_date || new Date().toISOString().split('T')[0],
    end_date: scheme?.end_date || new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0],
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !form.code.trim()) {
      Alert.alert('Missing info', 'Title and code are required');
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        code: form.code.trim().toUpperCase(),
        scheme_type: form.scheme_type,
        min_order_value: Number(form.min_order_value) || 0,
        per_user_limit: Number(form.per_user_limit) || 0,
        start_date: form.start_date,
        end_date: form.end_date,
      };
      if (form.scheme_type === 'Discount') {
        payload.discount_percent = Number(form.discount_percent) || 0;
        payload.max_discount = Number(form.max_discount) || null;
        payload.flat_discount = null;
      } else {
        payload.flat_discount = Number(form.flat_discount) || 0;
        payload.discount_percent = null;
        payload.max_discount = null;
      }
      const res = await fetch(useStore.getState().getSchemesUrl(), {
        method: isNew ? 'POST' : 'PUT',
        headers: useStore.getState().authHeaders(),
        body: JSON.stringify(isNew ? payload : { id: scheme.id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(isNew ? 'Scheme created' : 'Scheme updated', 'success');
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setBusy(false);
  };

  const F = ({ label, ...rest }: any) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</Text>
      <TextInput
        placeholderTextColor="#94a3b8"
        style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', color: '#0f172a' }}
        {...rest}
      />
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#F7FAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: '#1A1A1A' }}>{isNew ? 'New scheme' : 'Edit scheme'}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            <F label="Title" value={form.title} onChangeText={(v: string) => setForm({ ...form, title: v })} placeholder="First-order Derma discount" />
            <F label="Description (optional)" value={form.description} onChangeText={(v: string) => setForm({ ...form, description: v })} placeholder="What the customer sees" multiline />
            <F label="Code (uppercase)" value={form.code} onChangeText={(v: string) => setForm({ ...form, code: v.toUpperCase() })} placeholder="DERMA10" autoCapitalize="characters" />

            {/* Type toggle */}
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['Discount', 'Flat'] as const).map((t) => {
                const active = form.scheme_type === t;
                return (
                  <TouchableOpacity key={t} onPress={() => setForm({ ...form, scheme_type: t })} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: active ? BRAND[800] : '#fff', borderWidth: 1, borderColor: active ? BRAND[800] : '#e2e8f0', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: active ? '#fff' : '#475569' }}>{t === 'Discount' ? '% Off' : '₹ Flat off'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {form.scheme_type === 'Discount' ? (
              <>
                <F label="Discount %" value={form.discount_percent} onChangeText={(v: string) => setForm({ ...form, discount_percent: v })} keyboardType="numeric" placeholder="10" />
                <F label="Max discount ₹ (optional cap)" value={form.max_discount} onChangeText={(v: string) => setForm({ ...form, max_discount: v })} keyboardType="numeric" placeholder="500" />
              </>
            ) : (
              <F label="Flat ₹ off" value={form.flat_discount} onChangeText={(v: string) => setForm({ ...form, flat_discount: v })} keyboardType="numeric" placeholder="200" />
            )}

            <F label="Min order ₹" value={form.min_order_value} onChangeText={(v: string) => setForm({ ...form, min_order_value: v })} keyboardType="numeric" placeholder="2500" />
            <F label="Per-user usage limit (0 = unlimited)" value={form.per_user_limit} onChangeText={(v: string) => setForm({ ...form, per_user_limit: v })} keyboardType="numeric" placeholder="1" />
            <F label="Start date (YYYY-MM-DD)" value={form.start_date} onChangeText={(v: string) => setForm({ ...form, start_date: v })} placeholder="2026-09-01" />
            <F label="End date (YYYY-MM-DD)" value={form.end_date} onChangeText={(v: string) => setForm({ ...form, end_date: v })} placeholder="2026-12-31" />

            <TouchableOpacity disabled={busy} onPress={save} style={{ backgroundColor: BRAND[800], paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{busy ? 'Saving…' : (isNew ? 'Create scheme' : 'Save changes')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AdminPricingScreen({ onBack }) {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <AdminBackHeader title="Pricing & Discounts" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Pricing sheet upload */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED20', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              <Ionicons name="cloud-upload-outline" size={20} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A' }}>Pricing sheet</Text>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Bulk-update PTR & MRP from XLSX</Text>
            </View>
          </View>
          <TouchableOpacity disabled style={{ paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' }}>
            <Ionicons name="document-outline" size={20} color="#94a3b8" />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748b', marginTop: 6 }}>Choose file · Coming in Phase 4</Text>
            <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 2 }}>Backend upload wires up with the storage rebuild</Text>
          </TouchableOpacity>
        </View>

        {/* Per-customer discounts */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND[100], justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              <Ionicons name="pricetag-outline" size={20} color={BRAND[800]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#1A1A1A' }}>Per-customer discounts</Text>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Grant a flat % or category discount to specific firms</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 8 }}>
            Existing coupon/scheme UI is already available on the customer side. This admin editor is queued for Phase 4 alongside the storage rebuild.
          </Text>
          <View style={{ backgroundColor: '#F1F5F9', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5 }}>NEXT UP</Text>
            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 4 }}>• Search customer · assign % discount</Text>
            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>• Category-level pricing rules</Text>
            <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>• Time-bound offers (expiry auto-clears)</Text>
          </View>
        </View>

        {/* Short expiry helper — link to products with the flag */}
        <View style={{ backgroundColor: '#FFF7ED', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#FED7AA' }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#B45309' }}>Short-expiry tip</Text>
          <Text style={{ fontSize: 12, color: '#9A3412', fontWeight: '600', marginTop: 4, lineHeight: 18 }}>
            Mark a product as “Short expiry offer” on the Product edit screen and set a discount %. It will surface in the Short expiry filter and homepage deals section automatically.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// --- App Root ---
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Loading');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [catalogInitialCategory, setCatalogInitialCategory] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminEditingProduct, setAdminEditingProduct] = useState<any>(null);

  // Restore session from AsyncStorage on cold start
  useEffect(() => {
    (async () => {
      try {
        const sessionId = await AsyncStorage.getItem('@upkem_session_id');
        const refreshToken = await AsyncStorage.getItem('@upkem_refresh_token');
        const userStr = await AsyncStorage.getItem('@upkem_user');
        if (sessionId && userStr) {
          useStore.getState().setSessionId(sessionId);
          if (refreshToken) useStore.getState().setRefreshToken(refreshToken);
          const u = JSON.parse(userStr);
          useStore.getState().setUser(u);
          setCurrentScreen((u?.is_admin || u?.role === 'admin') ? 'AdminHome' : 'Home');
        } else {
          setCurrentScreen('Login');
        }
      } catch {
        setCurrentScreen('Login');
      }
    })();
  }, []);

  // Route freshly-logged-in admins into AdminHome once user is set
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (state.user && state.user !== prev?.user && (state.user.is_admin || state.user.role === 'admin') && currentScreen === 'Home') {
        setCurrentScreen('AdminHome');
      }
    });
    return () => { try { unsub && unsub(); } catch {} };
  }, [currentScreen]);

  // Deeplink handler — when a push notification is tapped, open the order it
  // references (order_id in the notification payload from /api/invoices/.../approve).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data || {};
      if (data.orderId) {
        // Find the matching order from cached list, then jump to tracking.
        const orders = useStore.getState().ordersList || [];
        const order = orders.find((o: any) => o.id === data.orderId);
        if (order) {
          setSelectedOrder(order);
          setCurrentScreen('Tracking');
        } else {
          // Fall back to orders list; user can then tap through.
          setCurrentScreen('Orders');
        }
      }
    });
    return () => sub.remove();
  }, []);

  const fetchAPI = async () => {
    // The data feed is private; skip polling until the user has a session.
    if (!useStore.getState().sessionId) return;
    try {
      const url = useStore.getState().getApiUrl();
      // authFetch transparently refreshes the JWT on 401 and retries once,
      // so a stale token no longer triggers the "OFFLINE MODE" banner.
      const res = await useStore.getState().authFetch(url);
      if (!res.ok) throw new Error('API Not OK');
      const db = await res.json();
      
      // Cache success to AsyncStorage
      await AsyncStorage.setItem('@upkem_cached_db', JSON.stringify(db));
      
      useStore.getState().setProducts(db.products || []);
      useStore.getState().setUsersList(db.users || []);
      useStore.getState().setSchemes(db.schemes || []);
      setIsOfflineMode(false);

      // Fetch notifications for the logged-in user (fire-and-forget)
      try {
        const nUrl = `${useStore.getState().getBaseUrl()}/api/notifications`;
        const nRes = await fetch(nUrl, { headers: useStore.getState().authHeaders() });
        if (nRes.ok) {
          const nData = await nRes.json();
          useStore.getState().setNotifications(nData.notifications || []);
        }
      } catch { /* ignore */ }
      
      const currUser = useStore.getState().user;
      if (currUser) {
        const userOrders = (currUser.is_admin || currUser.role === 'admin')
          ? (db.orders || [])
          : (db.orders || []).filter(o => o.phone === currUser.phone || o.store === currUser.store_name || o.user_phone === currUser.phone || o.store_name === currUser.store_name);
        useStore.getState().setOrders(userOrders);
        const liveUser = db.users.find(u => u.phone === currUser.phone);
        if (liveUser && JSON.stringify(liveUser) !== JSON.stringify(currUser)) {
          useStore.getState().setUser(liveUser);
          AsyncStorage.setItem('@upkem_user', JSON.stringify(liveUser)).catch(() => {});
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
    if (currentScreen === 'Loading') return (
      <View style={{ flex: 1, backgroundColor: '#0B2618', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" />
        <UpkemLoader size={96} variant="light" />
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 20, textTransform: 'uppercase' }}>Upkem Labs</Text>
      </View>
    );
    if (currentScreen === 'Login') return <LoginScreen setCurrentScreen={setCurrentScreen} />;
    if (currentScreen === 'Signup') return <SignupScreen setCurrentScreen={setCurrentScreen} />;
    if (currentScreen === 'PendingApproval') return <PendingApprovalScreen setCurrentScreen={setCurrentScreen} />;

    // Admin surfaces — separate render tree (no bottom tab bar)
    const adminSignOut = async () => {
      Alert.alert('Sign out', 'Sign out of the admin portal?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['@upkem_session_id', '@upkem_refresh_token', '@upkem_user', '@upkem_cached_db']);
          useStore.getState().setUser(null);
          useStore.getState().clearCart();
          useStore.getState().setSessionId(null); useStore.getState().setRefreshToken(null);
          setCurrentScreen('Login');
        }},
      ]);
    };
    if (currentScreen === 'AdminHome') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminHomeScreen
          setCurrentScreen={setCurrentScreen}
          onOpenApprovals={() => setCurrentScreen('AdminApprovals')}
          onOpenOrders={() => setCurrentScreen('AdminOrders')}
          onOpenProducts={() => setCurrentScreen('AdminProducts')}
          onOpenPricing={() => setCurrentScreen('AdminPricing')}
          onOpenUsers={() => setCurrentScreen('AdminUsers')}
          onOpenSchemes={() => setCurrentScreen('AdminSchemes')}
          onOpenAnalytics={() => setCurrentScreen('AdminAnalytics')}
          onOpenNotifications={() => setCurrentScreen('AdminNotifications')}
          onOpenChangeRequests={() => setCurrentScreen('AdminChangeRequests')}
          onOpenCreditRequests={() => setCurrentScreen('AdminCreditRequests')}
          onExit={adminSignOut}
        />
      </View>
    );
    if (currentScreen === 'AdminApprovals') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminApprovalsScreen onBack={() => setCurrentScreen('AdminHome')} onRefresh={fetchAPI} />
      </View>
    );
    if (currentScreen === 'AdminOrders') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminOrdersScreen
          onBack={() => setCurrentScreen('AdminHome')}
          onOpenOrder={(o: any) => { setSelectedOrder(o); setCurrentScreen('AdminOrderDetail'); }}
        />
      </View>
    );
    if (currentScreen === 'AdminOrderDetail') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminOrderDetailScreen
          order={selectedOrder}
          onBack={() => setCurrentScreen('AdminOrders')}
          onOrderUpdated={(o: any) => setSelectedOrder(o)}
        />
      </View>
    );
    if (currentScreen === 'AdminProducts') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminProductsScreen
          onBack={() => setCurrentScreen('AdminHome')}
          onEditProduct={(p: any) => { setAdminEditingProduct(p); setCurrentScreen('AdminProductEdit'); }}
          onAddProduct={() => { setAdminEditingProduct(null); setCurrentScreen('AdminProductEdit'); }}
          onRefresh={fetchAPI}
        />
      </View>
    );
    if (currentScreen === 'AdminProductEdit') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminProductEditScreen
          product={adminEditingProduct}
          onBack={() => setCurrentScreen('AdminProducts')}
          onSaved={() => setCurrentScreen('AdminProducts')}
        />
      </View>
    );
    if (currentScreen === 'AdminUsers') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminUsersScreen onBack={() => setCurrentScreen('AdminHome')} onRefresh={fetchAPI} />
      </View>
    );
    if (currentScreen === 'AdminSchemes') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminSchemesScreen onBack={() => setCurrentScreen('AdminHome')} />
      </View>
    );
    if (currentScreen === 'AdminAnalytics') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminAnalyticsScreen onBack={() => setCurrentScreen('AdminHome')} />
      </View>
    );
    if (currentScreen === 'AdminNotifications') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminNotificationsScreen onBack={() => setCurrentScreen('AdminHome')} />
      </View>
    );
    if (currentScreen === 'AdminChangeRequests') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminChangeRequestsScreen onBack={() => setCurrentScreen('AdminHome')} />
      </View>
    );
    if (currentScreen === 'AdminCreditRequests') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminCreditRequestsScreen onBack={() => setCurrentScreen('AdminHome')} />
      </View>
    );
    if (currentScreen === 'AdminPricing') return (
      <View style={{ flex: 1, backgroundColor: '#F7FAF8', paddingTop: Constants.statusBarHeight || 48 }}>
        <AdminPricingScreen onBack={() => setCurrentScreen('AdminHome')} />
      </View>
    );
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

  return <ToastProvider><View style={{ flex: 1 }}>{renderScreen()}</View></ToastProvider>;
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
  filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 12 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: BRAND[50], borderColor: BRAND[800], borderWidth: 1.5 },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: BRAND[800], fontWeight: '800' },

  // Sub-category header row (title + count badge) + inline search
  filterSectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 12, gap: 8 },
  filterCountBadge: { backgroundColor: BRAND[800], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, minWidth: 22, alignItems: 'center' },
  filterCountText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  filterSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  filterSearchInput: { flex: 1, fontSize: 14, color: '#0f172a', fontWeight: '500', padding: 0 },
  filterEmptyText: { color: '#94a3b8', fontSize: 13, fontWeight: '600', paddingVertical: 8 },
});
