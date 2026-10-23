import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5174',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',

  // Mercado Pago Perú
  mercadopago: {
    publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || 'TEST-sample-public-key',
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-sample-access-token'
  },

  // Optional Culqi fallback
  culqi: {
    publicKey: process.env.CULQI_PUBLIC_KEY || 'pk_test_sample',
    secretKey: process.env.CULQI_SECRET_KEY || 'sk_test_sample',
    apiUrl: 'https://api.culqi.com/v2'
  }
};
