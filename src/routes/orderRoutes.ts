import { Router, Request, Response } from 'express';
import { orderService } from '../services/orderService.js';

export const orderRouter = Router();

/**
 * GET /api/orders
 * Returns all store orders
 */
orderRouter.get('/', (_req: Request, res: Response) => {
  const orders = orderService.getAllOrders();
  res.status(200).json({ success: true, count: orders.length, orders });
});

/**
 * GET /api/orders/:id
 * Retrieve specific order by ID or Order Number
 */
orderRouter.get('/:id', (req: Request, res: Response): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const order = orderService.getOrderById(id) || orderService.getOrderByNumber(id);

  if (!order) {
    res.status(404).json({ success: false, message: 'Orden no encontrada' });
    return;
  }

  res.status(200).json({ success: true, order });
});

/**
 * PATCH /api/orders/:id/status
 * Manually update order status (e.g., mark PagoEfectivo or Transferencia as PAGADO)
 */
orderRouter.patch('/:id/status', (req: Request, res: Response): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { status, transactionId } = req.body;

  const updated = orderService.updateOrderStatus(id, status, { transactionId });
  if (!updated) {
    res.status(404).json({ success: false, message: 'Orden no encontrada' });
    return;
  }

  res.status(200).json({ success: true, order: updated });
});
