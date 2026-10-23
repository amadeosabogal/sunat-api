process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { orderRouter } from './routes/orderRoutes.js';
import { webhookRouter } from './routes/webhookRoutes.js';
import { sunatRouter } from './routes/sunatRoutes.js';
import { sunatService } from './services/sunatService.js';

const app = express();

// Middlewares
app.use(cors({
  origin: '*', // Allows requests from React client (http://localhost:5174 or custom)
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY', 'x-api-key']
}));

app.use(express.json());

// Health Check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Woditek E-Commerce Backend API',
    currency: 'PEN (Soles Peruanos)',
    mode: 'Sandbox / Test',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/payments', paymentRouter);
app.use('/api/orders', orderRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/sunat', sunatRouter);

// Start server
// Inicializar SDK SUNAT al inicio
sunatService.init().catch(err => console.warn('Aviso inicializando SUNAT SDK:', err));

app.listen(config.port, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Woditek E-commerce Backend API`);
  console.log(`🌐 Servidor corriendo en: http://localhost:${config.port}`);
  console.log(`💳 Pasarelas activas: Culqi (Perú), Mercado Pago, Yape/Plin`);
  console.log(`💰 Moneda de prueba: Soles Peruanos (PEN S/.)`);
  console.log(`=================================================\n`);
});

export default app;
