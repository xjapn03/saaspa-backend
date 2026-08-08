export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiration: process.env.JWT_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  wompi: {
    publicKey: process.env.WOMPI_PUBLIC_KEY,
    privateKey: process.env.WOMPI_PRIVATE_KEY,
    eventsKey: process.env.WOMPI_EVENTS_KEY,
    webhookSecret: process.env.WOMPI_WEBHOOK_SECRET,
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
  },

  google: {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },

  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    whatsappPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    whatsappAccessToken: process.env.META_WHATSAPP_ACCESS_TOKEN,
    whatsappVerifyToken: process.env.META_WHATSAPP_VERIFY_TOKEN,
    capiAccessToken: process.env.META_CAPI_ACCESS_TOKEN,
    capiPixelId: process.env.META_CAPI_PIXEL_ID,
  },

  iaBot: {
    url: process.env.IA_BOT_URL || 'http://localhost:8000',
    apiKey: process.env.IA_BOT_API_KEY,
  },
});
