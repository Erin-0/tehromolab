import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobilePhone } from './deviceDetection';

test('isMobilePhone flags iPhone user agent as mobile phone', () => {
  const iphoneUA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(isMobilePhone({ userAgent: iphoneUA, screenWidth: 390, screenHeight: 844 }), true);
});

test('isMobilePhone flags Android Mobile user agent as mobile phone', () => {
  const androidUA =
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  assert.equal(isMobilePhone({ userAgent: androidUA, screenWidth: 412, screenHeight: 915 }), true);
});

test('isMobilePhone flags narrow viewport (<= 850px) on desktop testing as mobile screen', () => {
  const desktopUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  assert.equal(
    isMobilePhone({
      userAgent: desktopUA,
      screenWidth: 420,
      screenHeight: 800,
      hasCoarsePointer: false,
    }),
    true,
  );
});

test('isMobilePhone flags landscape phone screen (e.g. 844x390) as mobile', () => {
  assert.equal(
    isMobilePhone({
      screenWidth: 844,
      screenHeight: 390,
      hasCoarsePointer: true,
    }),
    true,
  );
});

test('isMobilePhone flags full desktop screen as NOT a mobile phone', () => {
  const desktopUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  assert.equal(
    isMobilePhone({
      userAgent: desktopUA,
      screenWidth: 1920,
      screenHeight: 1080,
      hasCoarsePointer: false,
    }),
    false,
  );
});

test('isMobilePhone flags Desktop Mac Safari as NOT a mobile phone', () => {
  const macUA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15';
  assert.equal(
    isMobilePhone({
      userAgent: macUA,
      screenWidth: 1440,
      screenHeight: 900,
      hasCoarsePointer: false,
    }),
    false,
  );
});
