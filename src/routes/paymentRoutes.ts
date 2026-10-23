import { Router, Request, Response } from 'express';
import { mercadopagoService } from '../services/mercadopagoService.js';
import { orderService } from '../services/orderService.js';
import { config } from '../config/index.js';
import { ProcessChargeDTO } from '../types/index.js';
import { sunatService } from '../services/sunatService.js';

export const paymentRouter = Router();

/**
 * GET /api/payments/config
 * Returns public configuration for Mercado Pago integration
 */
paymentRouter.get('/config', (_req: Request, res: Response) => {
  res.status(200).json({
    gateway: 'Mercado Pago Perú',
    publicKey: config.mercadopago.publicKey,
    currency: 'PEN',
    sandboxMode: true
  });
});

/**
 * POST /api/payments/mercadopago/preference
 * Generates an official Mercado Pago Checkout Pro Preference (PEN S/.)
 */
paymentRouter.post('/mercadopago/preference', async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, customer, amount } = req.body;

    if (!items || items.length === 0 || !customer) {
      res.status(400).json({
        success: false,
        message: 'Items y datos del cliente son requeridos'
      });
      return;
    }

    // 1. Create order in database
    const order = orderService.createOrder({
      customer,
      items,
      amount: amount || items.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0),
      paymentMethod: 'mercadopago'
    }, 'PENDIENTE');

    // 2. Generate preference with Mercado Pago
    const result = await mercadopagoService.createCheckoutPreference(
      items,
      customer,
      order.id,
      order.orderNumber
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'No se pudo generar la preferencia en Mercado Pago'
      });
      return;
    }

    res.status(200).json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      preferenceId: result.preferenceId,
      initPoint: result.initPoint,
      sandboxInitPoint: result.sandboxInitPoint
    });
  } catch (error: any) {
    console.error('Error al crear preferencia de Mercado Pago:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al conectar con Mercado Pago'
    });
  }
});

/**
 * POST /api/payments/process
 * General payment processor using Mercado Pago
 */
paymentRouter.post('/process', async (req: Request, res: Response): Promise<void> => {
  try {
    const dto: ProcessChargeDTO = req.body;

    if (!dto.amount || !dto.customer || !dto.items || dto.items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios para procesar la orden.'
      });
      return;
    }

    // 1. Create order
    const order = orderService.createOrder(dto, 'PAGADO');

    // 2. Simulate or execute Mercado Pago card payment
    const paymentId = `mp_test_${Date.now()}`;
    // Emitir comprobante electrónico SUNAT automáticamente
    let sunatVoucher = null;
    try {
      sunatVoucher = await sunatService.emitVoucher({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customer: dto.customer,
        items: dto.items,
        totalAmount: dto.amount
      });
    } catch (sunatErr) {
      console.warn('Aviso: Comprobante SUNAT no emitido:', sunatErr);
    }

    orderService.updateOrderStatus(order.id, 'PAGADO', {
      transactionId: paymentId,
      paidAt: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      status: 'PAGADO',
      orderNumber: order.orderNumber,
      orderId: order.id,
      chargeId: paymentId,
      amount: dto.amount,
      currency: 'PEN',
      gateway: 'Mercado Pago Perú',
      message: 'Pago procesado exitosamente a través de Mercado Pago',
      voucher: sunatVoucher
    });
  } catch (error: any) {
    console.error('Error al procesar pago:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor al procesar el pago'
    });
  }
});
