import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mentor.app',
  appName: 'Mentor',
  webDir: 'dist',
  server: {
    // The user points the app at their own server (LAN, VPN, or a public VPS).
    cleartext: true,
    allowNavigation: ['*://*:*'],
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
