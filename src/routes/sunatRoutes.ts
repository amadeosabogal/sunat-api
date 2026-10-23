import { Router, Request, Response } from 'express';
import { sunatService, EmitVoucherDTO } from '../services/sunatService.js';
import { orderService } from '../services/orderService.js';
import { existsSync, readFileSync } from 'node:fs';
import { sunatRateLimiter } from '../middlewares/rateLimiter.js';
import { requireApiKey } from '../middlewares/authApiKey.js';

export const sunatRouter = Router();

// 🛡️ Seguridad: Límite de peticiones (Rate Limiting contra ataques DoS/Spam)
sunatRouter.use(sunatRateLimiter);

/**
 * POST /api/sunat/emit
 * Emite un comprobante a SUNAT (Boleta o Factura) para un carrito u orden
 */
sunatRouter.post('/emit', requireApiKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const dto: EmitVoucherDTO = req.body;

    if (!dto.items || dto.items.length === 0 || !dto.customer) {
      res.status(400).json({
        success: false,
        message: 'Se requiere información de cliente y al menos un producto.'
      });
      return;
    }

    const voucher = await sunatService.emitVoucher(dto);

    // Si viene vinculado a una orden, actualizar detalles
    if (dto.orderId) {
      orderService.updateOrderStatus(dto.orderId, 'PAGADO', {
        transactionId: voucher.id,
        paidAt: voucher.issueDate,
        gatewayResponse: {
          sunatId: voucher.id,
          seriesNumber: `${voucher.series}-${voucher.number}`,
          status: voucher.status
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Comprobante ${voucher.series}-${voucher.number} emitido y procesado con éxito`,
      voucher
    });
  } catch (error: any) {
    console.error('Error al emitir comprobante SUNAT:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar comprobante con SUNAT'
    });
  }
});

/**
 * POST /api/sunat/void
 * Anula un comprobante emitiendo una Nota de Crédito electrónica (Tipo 07)
 */
sunatRouter.post('/void', requireApiKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const { voucherId, reason } = req.body;

    if (!voucherId) {
      res.status(400).json({
        success: false,
        message: 'Se requiere el ID o serie-número del comprobante a anular.'
      });
      return;
    }

    const result = await sunatService.voidVoucher(voucherId, reason);

    // Si la orden estaba vinculada, actualizar estado de la orden
    if (result.original.orderId) {
      orderService.updateOrderStatus(result.original.orderId, 'CANCELADO', {
        transactionId: result.creditNote.id,
        paidAt: result.creditNote.issueDate,
        gatewayResponse: {
          voided: true,
          creditNote: `${result.creditNote.series}-${result.creditNote.number}`,
          voidReason: result.original.voidReason
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Comprobante ${result.original.series}-${result.original.number} anulado con éxito mediante Nota de Crédito ${result.creditNote.series}-${result.creditNote.number}`,
      creditNote: result.creditNote,
      original: result.original
    });
  } catch (error: any) {
    console.error('Error al anular comprobante SUNAT:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al anular comprobante con SUNAT'
    });
  }
});

/**
 * GET /api/sunat/history
 * Lista todos los comprobantes emitidos en la sesión
 */
sunatRouter.delete('/history', (_req: Request, res: Response) => {
  sunatService.clearHistory();
  res.status(200).json({ success: true, message: 'Historial de comprobantes limpiado.' });
});

sunatRouter.get('/history', (_req: Request, res: Response) => {
  const vouchers = sunatService.getVouchersHistory();
  res.status(200).json({
    success: true,
    count: vouchers.length,
    vouchers
  });
});

/**
 * GET /api/sunat/vouchers/:id
 * Obtiene un comprobante por ID o Serie-Número
 */
sunatRouter.get('/vouchers/:id', (req: Request, res: Response): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const voucher = sunatService.getVoucherById(id) || sunatService.getVoucherByOrderId(id);

  if (!voucher) {
    res.status(404).json({ success: false, message: 'Comprobante no encontrado' });
    return;
  }

  res.status(200).json({ success: true, voucher });
});

/**
 * GET /api/sunat/download/xml/:id
 * Descarga el XML firmado
 */
sunatRouter.get('/download/xml/:id', (req: Request, res: Response): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const voucher = sunatService.getVoucherById(id);

  if (!voucher) {
    res.status(404).json({ success: false, message: 'Comprobante no encontrado' });
    return;
  }

  const filePath = sunatService.getXmlFilePath(voucher.xmlFilename);
  if (!existsSync(filePath)) {
    res.status(404).json({ success: false, message: 'Archivo XML no encontrado en disco' });
    return;
  }

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${voucher.xmlFilename}"`);
  const content = readFileSync(filePath);
  res.send(content);
});

/**
 * GET /api/sunat/download/cdr/:id
 * Descarga el CDR ZIP de SUNAT
 */
sunatRouter.get('/download/cdr/:id', (req: Request, res: Response): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const voucher = sunatService.getVoucherById(id);

  if (!voucher || !voucher.cdrFilename) {
    res.status(404).json({ success: false, message: 'CDR no disponible para este comprobante' });
    return;
  }

  const filePath = sunatService.getCdrFilePath(voucher.cdrFilename);
  if (!existsSync(filePath)) {
    res.status(404).json({ success: false, message: 'Archivo CDR no encontrado en disco' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${voucher.cdrFilename}"`);
  const content = readFileSync(filePath);
  res.send(content);
});

/**
 * GET /api/sunat/qrcode
 * Generador de QR dinámico
 */
sunatRouter.get('/qrcode', async (req: Request, res: Response): Promise<void> => {
  try {
    const text = req.query.text as string;
    if (!text) {
      res.status(400).json({ success: false, message: 'Texto requerido' });
      return;
    }
    const dataUrl = await sunatService.generateQrCodeDataUrl(text);
    res.status(200).json({ success: true, dataUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
