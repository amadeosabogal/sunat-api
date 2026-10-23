export type PaymentMethodType = 'card' | 'yape' | 'plin' | 'pagoefectivo' | 'transferencia' | 'mercadopago';

export type OrderStatus = 'PENDIENTE' | 'PAGADO' | 'RECHAZADO' | 'CANCELADO';

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number; // in PEN (S/.)
  quantity: number;
}

export interface CustomerInfo {
  fullName: string;
  email: string;
  phone: string;
  documentType: 'DNI' | 'RUC' | 'CE';
  documentNumber: string;
  address: string;
  city: string;
  department: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: CustomerInfo;
  items: OrderItem[];
  totalAmount: number; // S/.
  currency: 'PEN';
  status: OrderStatus;
  paymentMethod: PaymentMethodType;
  paymentDetails?: {
    transactionId?: string;
    token?: string;
    cipCode?: string; // PagoEfectivo
    yapeOtp?: string;
    paidAt?: string;
    gatewayResponse?: Record<string, any>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProcessChargeDTO {
  orderId?: string;
  customer: CustomerInfo;
  items: OrderItem[];
  amount: number; // in S/.
  paymentMethod: PaymentMethodType;
  cardToken?: string; // Culqi or Gateway token
  yapePhoneNumber?: string;
  yapeOtp?: string;
}
