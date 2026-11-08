/**
 * Utility functions for detecting mobile phone devices.
 * Distinguishes between desktop computers/laptops (mouse + keyboard + large screen)
 * and mobile phones (touchscreen, small viewport, mobile user agent).
 */

export interface DeviceCheckOptions {
  userAgent?: string;
  screenWidth?: number;
  screenHeight?: number;
  hasCoarsePointer?: boolean;
}

/**
 * Checks whether a given environment represents a mobile phone device or mobile-sized screen.
 * Triggers when:
 * 1. Screen width <= 850px (portrait phone or narrow browser window simulating a mobile device)
 * 2. Screen height <= 520px and width <= 960px (landscape phone)
 * 3. User agent contains mobile phone identifiers (Android, iPhone, Mobile, etc.)
 * 4. Coarse touch pointer with viewport <= 1024px
 */
export function isMobilePhone(options: DeviceCheckOptions = {}): boolean {
  const ua =
    options.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  // 1. Mobile phone user agent regex (smartphones, Android phones, iPhones, Windows Phone, etc.)
  const phoneUaRegex =
    /Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;
  const isPhoneUA = phoneUaRegex.test(ua);

  // 2. Viewport dimensions
  const width =
    options.screenWidth ??
    (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const height =
    options.screenHeight ??
    (typeof window !== 'undefined' ? window.innerHeight : 1080);

  // Any viewport with mobile phone width (<= 850px)
  const isNarrowViewport = width <= 850;

  // Landscape phone: very low height (<= 520px) with phone length (<= 960px)
  const isLandscapePhone = height <= 520 && width <= 960;

  // 3. Coarse touch pointer (primary input is touch finger rather than desktop mouse cursor)
  const isCoarse =
    options.hasCoarsePointer ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false);

  return isPhoneUA || isNarrowViewport || isLandscapePhone || (isCoarse && width <= 1024);
}
