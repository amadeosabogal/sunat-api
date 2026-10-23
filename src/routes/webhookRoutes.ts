import { Router, Request, Response } from 'express';
import { orderService } from '../services/orderService.js';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/culqi
 * Receives notifications from Culqi when a payment is completed
 */
webhookRouter.post('/culqi', (req: Request, res: Response): void => {
  try {
    const event = req.body;
    console.log('[Culqi Webhook] Evento recibido:', event.type || event);

    if (event.type === 'charge.creation.succeeded') {
      const charge = event.data;
      const orderId = charge.metadata?.orderId;
      if (orderId) {
        orderService.updateOrderStatus(orderId, 'PAGADO', {
          transactionId: charge.id,
          paidAt: new Date().toISOString()
        });
        console.log(`[Culqi Webhook] Orden ${orderId} actualizada a PAGADO por S/. ${charge.amount / 100}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[Culqi Webhook] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/webhooks/mercadopago
 * Receives IPN / Webhooks from Mercado Pago
 */
webhookRouter.post('/mercadopago', (req: Request, res: Response): void => {
  try {
    const notification = req.body;
    console.log('[Mercado Pago Webhook] Notificación recibida:', notification);

    if (notification.type === 'payment' || notification.action === 'payment.created') {
      const paymentId = notification.data?.id || notification.id;
      console.log(`[Mercado Pago Webhook] Procesando pago ID: ${paymentId}`);
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[Mercado Pago Webhook] Error:', error);
    res.status(400).json({ error: error.message });
  }
});
