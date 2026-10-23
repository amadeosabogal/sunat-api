import { MercadoPagoConfig, Preference } from 'mercadopago';
import { config } from '../config/index.js';
import { OrderItem, CustomerInfo } from '../types/index.js';

export interface CreatePreferenceResult {
  success: boolean;
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
  error?: string;
  raw?: any;
}

export class MercadoPagoService {
  private getClient(): MercadoPagoConfig | null {
    let token = config.mercadopago.accessToken?.trim();
    if (!token || token.includes('sample')) {
      return null;
    }

    // Si el usuario pegó TEST-APP_USR-..., normalizar a APP_USR-...
    if (token.startsWith('TEST-APP_USR-')) {
      token = token.replace('TEST-APP_USR-', 'APP_USR-');
    }

    try {
      return new MercadoPagoConfig({
        accessToken: token,
        options: { timeout: 10000 }
      });
    } catch (err) {
      console.error('[Mercado Pago Config Error]:', err);
      return null;
    }
  }

  /**
   * Crea una Preferencia de Pago oficial en Mercado Pago (PEN S/.)
   */
  async createCheckoutPreference(
    items: OrderItem[],
    customer: CustomerInfo,
    orderId: string,
    orderNumber: string
  ): Promise<CreatePreferenceResult> {
    const client = this.getClient();

    const mpItems = items.map((item) => ({
      id: item.productId,
      title: item.name,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unitPrice) > 0 ? Number(item.unitPrice) : 1.0,
      currency_id: 'PEN'
    }));

    if (client) {
      try {
        console.log(`[Mercado Pago] Creando preferencia para Orden ${orderNumber} (${items.length} items)...`);
        const preference = new Preference(client);
        
        const response = await preference.create({
          body: {
            items: mpItems,
            payer: {
              name: customer.fullName.split(' ')[0] || customer.fullName || 'Comprador',
              surname: customer.fullName.split(' ').slice(1).join(' ') || 'Cliente',
              email: customer.email || 'cliente@woditek.com',
              phone: {
                number: customer.phone || '987654321'
              },
              identification: {
                type: customer.documentType || 'DNI',
                number: customer.documentNumber || '72345678'
              },
              address: {
                street_name: customer.address || 'Av. Principal',
                street_number: '100',
                zip_code: '15036'
              }
            },
            back_urls: {
              success: `${config.clientUrl}?payment=approved&orderNumber=${orderNumber}&orderId=${orderId}`,
              failure: `${config.clientUrl}?payment=failure&orderNumber=${orderNumber}&orderId=${orderId}`,
              pending: `${config.clientUrl}?payment=pending&orderNumber=${orderNumber}&orderId=${orderId}`
            },
            ...(config.clientUrl.startsWith('https://') ? { auto_return: 'approved' } : {}),
            external_reference: orderId,
            statement_descriptor: process.env.EMPRESA_NOMBRE_COMERCIAL || 'WODITEK'
          }
        });

        console.log(`[Mercado Pago] ¡Preferencia Creada Exitosamente! ID: ${response.id}`);
        console.log(`[Mercado Pago] URL de Checkout: ${response.init_point}`);

        return {
          success: true,
          preferenceId: response.id || '',
          initPoint: response.init_point || '',
          sandboxInitPoint: response.sandbox_init_point || response.init_point || ''
        };
      } catch (error: any) {
        console.error('[Mercado Pago API Error]:', error.message || error);
        return {
          success: false,
          preferenceId: '',
          initPoint: '',
          sandboxInitPoint: '',
          error: error.message || 'Error al autorizar con Mercado Pago (403 Unauthorized)'
        };
      }
    }

    // Si no hay token configurado
    return {
      success: false,
      preferenceId: '',
      initPoint: '',
      sandboxInitPoint: '',
      error: 'No se ha configurado un Access Token válido de Mercado Pago en service/.env'
    };
  }
}

export const mercadopagoService = new MercadoPagoService();
