import { Order, OrderStatus, ProcessChargeDTO } from '../types/index.js';

class OrderService {
  private orders: Map<string, Order> = new Map();

  createOrder(dto: ProcessChargeDTO, status: OrderStatus = 'PENDIENTE'): Order {
    const id = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = `STF-PE-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const order: Order = {
      id,
      orderNumber,
      customer: dto.customer,
      items: dto.items,
      totalAmount: dto.amount,
      currency: 'PEN',
      status,
      paymentMethod: dto.paymentMethod,
      paymentDetails: {},
      createdAt: now,
      updatedAt: now
    };

    this.orders.set(id, order);
    return order;
  }

  getOrderById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  getOrderByNumber(orderNumber: string): Order | undefined {
    return Array.from(this.orders.values()).find(o => o.orderNumber === orderNumber);
  }

  updateOrderStatus(
    id: string, 
    status: OrderStatus, 
    paymentDetails?: Partial<Order['paymentDetails']>
  ): Order | undefined {
    const order = this.orders.get(id);
    if (!order) return undefined;

    order.status = status;
    order.updatedAt = new Date().toISOString();
    if (paymentDetails) {
      order.paymentDetails = { ...order.paymentDetails, ...paymentDetails };
    }

    this.orders.set(id, order);
    return order;
  }

  getAllOrders(): Order[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export const orderService = new OrderService();
