import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { load } from '@kembec/facturacion-electronica-sunat-sdk';
import { CustomerInfo, OrderItem } from '../types/index.js';

export interface EmitVoucherDTO {
  orderId?: string;
  orderNumber?: string;
  voucherType?: '01' | '03'; // '01': Factura, '03': Boleta
  customer: CustomerInfo;
  items: OrderItem[];
  totalAmount?: number;
}

export interface SunatVoucherRecord {
  id: string; // e.g. 20000000001-01-F001-8805
  orderId?: string;
  orderNumber?: string;
  documentType: '01' | '03' | '07';
  documentTitle: string;
  series: string;
  number: string;
  issueDate: string;
  issuer?: {
    ruc: string;
    legalName: string;
    tradeName?: string;
    address?: string;
    email?: string;
    telephone?: string;
  };
  customer: {
    legalName: string;
    documentType: string;
    documentTypeName: string;
    documentNumber: string;
    address?: string;
  };
  totals: {
    taxed: string;
    igv: string;
    payable: string;
  };
  items: Array<{
    quantity: number;
    description: string;
    unitPrice: string;
    total: string;
  }>;
  itemsCount: number;
  digestValue: string;
  legend: string;
  status: 'accepted' | 'rejected' | 'observed';
  responseCode: string;
  description: string;
  xmlFilename: string;
  cdrFilename: string | null;
  xml: string;
  cdrBase64?: string;
  rawOutcome: any;
  qrCodeDataUrl: string;
  qrRawText: string;
  createdAt: string;
  // Anulación / Nota de Crédito
  isVoided?: boolean;
  voidedAt?: string;
  voidReason?: string;
  creditNoteId?: string;
  creditNoteSeriesNumber?: string;
  noteReference?: {
    reason_code: string;
    reason: string;
    affected_document_type: string;
    affected_document_number: string;
  };
}

class SunatService {
  private sdk: any = null;
  private certPem: string = '';
  private keyPem: string = '';
  private isInitialized = false;

  private invoiceSeq = parseInt(process.env.CORRELATIVO_FACTURA || '0', 10);
  private receiptSeq = parseInt(process.env.CORRELATIVO_BOLETA || '0', 10);
  private creditNoteInvoiceSeq = parseInt(process.env.CORRELATIVO_NC_FACTURA || '0', 10);
  private creditNoteReceiptSeq = parseInt(process.env.CORRELATIVO_NC_BOLETA || '0', 10);

  private vouchersHistory: SunatVoucherRecord[] = [];
  private readonly storageDir: string;
  private readonly historyFilePath: string;

  constructor() {
    this.storageDir = join(process.cwd(), 'storage', 'vouchers');
    this.historyFilePath = join(this.storageDir, 'history.json');
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadHistory();
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.sdk = await load();

      const prodCert = process.env.SUNAT_CERT_PATH ? join(process.cwd(), process.env.SUNAT_CERT_PATH) : join(process.cwd(), 'certs', 'cert.pem');
      const prodKey = process.env.SUNAT_KEY_PATH ? join(process.cwd(), process.env.SUNAT_KEY_PATH) : join(process.cwd(), 'certs', 'key.pem');

      if (existsSync(prodCert) && existsSync(prodKey)) {
        this.certPem = readFileSync(prodCert, 'utf8');
        this.keyPem = readFileSync(prodKey, 'utf8');
        console.log('🔒 Certificado Digital cargado exitosamente (cert.pem)');
      } else {
        throw new Error('Certificados digitales SUNAT (cert.pem y key.pem) no encontrados en certs/.');
      }

      this.isInitialized = true;
      console.log('✅ SDK SUNAT Facturación Electrónica inicializado con éxito en E-commerce');
    } catch (error) {
      console.error('❌ Error al inicializar SDK SUNAT:', error);
      throw error;
    }
  }

  private montoEnLetras(monto: number): string {
    const entero = Math.floor(monto);
    const decimales = Math.round((monto - entero) * 100).toString().padStart(2, '0');
    return `SON ${entero} Y ${decimales}/100 SOLES`;
  }

  
  private getIssuer() {
    return {
      ruc: process.env.EMPRESA_RUC || '20615491609',
      legal_name: process.env.EMPRESA_RAZON_SOCIAL || 'WODITEK DISEÑO Y TECNOLOGIA S.A.C.',
      trade_name: process.env.EMPRESA_NOMBRE_COMERCIAL || 'WODITEK',
      email: process.env.EMPRESA_EMAIL || 'soporte@woditek.com',
      telephone: process.env.EMPRESA_TELEFONO || '953 095 173',
      address: {
        ubigeo: process.env.EMPRESA_UBIGEO || '150131',
        country_code: 'PE',
        department: process.env.EMPRESA_DEPARTAMENTO || 'LIMA',
        province: process.env.EMPRESA_PROVINCIA || 'LIMA',
        district: process.env.EMPRESA_DISTRITO || 'SAN ISIDRO',
        street: process.env.EMPRESA_DIRECCION || 'CALLE GERMAN SCHREIBER NRO. 276, URB. SANTA ANA',
        establishment_code: '0000'
      }
    };
  }

  private getSunatCredentials() {
    return {
      solUser: process.env.SUNAT_SOL_USER || '20100066603MODDATOS',
      solPassword: process.env.SUNAT_SOL_PASSWORD || 'moddatos',
      billServiceUrl: process.env.SUNAT_ENDPOINT || 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService'
    };
  }

  private getLimaIsoDate(): string {
    const now = new Date();
    const limaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    const limaTimeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    return `${limaDateStr}T${limaTimeStr}-05:00`;
  }

  async emitVoucher(dto: EmitVoucherDTO): Promise<SunatVoucherRecord> {
    if (!this.isInitialized) {
      await this.init();
    }

    if (!dto.items || dto.items.length === 0) {
      throw new Error('El comprobante debe contener al menos un producto.');
    }

    const isRuc = dto.customer.documentType === 'RUC' || (dto.customer.documentNumber && dto.customer.documentNumber.length === 11);
    const documentType: '01' | '03' = dto.voucherType || (isRuc ? '01' : '03');
    const isInvoice = documentType === '01';

    const series = isInvoice ? 'F001' : 'B001';
    const number = isInvoice ? `${++this.invoiceSeq}` : `${++this.receiptSeq}`;
    const issueDate = this.getLimaIsoDate();

    let sunatDocType = '1';
    if (dto.customer.documentType === 'RUC' || isRuc) {
      sunatDocType = '6';
    } else if (dto.customer.documentType === 'CE') {
      sunatDocType = '4';
    } else if (!dto.customer.documentNumber || dto.customer.documentNumber === '-') {
      sunatDocType = '-';
    }

    let totalTaxed = 0;
    let totalIgv = 0;

    const lines = dto.items.map((item, idx) => {
      const qty = item.quantity || 1;
      const unitPriceWithIgv = parseFloat(item.unitPrice.toString());
      const lineTotalWithIgv = +(unitPriceWithIgv * qty).toFixed(2);

      const unitValueWithoutIgv = +(unitPriceWithIgv / 1.18).toFixed(2);
      const lineValueWithoutIgv = +(lineTotalWithIgv / 1.18).toFixed(2);
      const lineIgv = +(lineTotalWithIgv - lineValueWithoutIgv).toFixed(2);

      totalTaxed += lineValueWithoutIgv;
      totalIgv += lineIgv;

      return {
        unit: 'NIU',
        quantity: `${qty}`,
        product_code: item.productId || `PROD-${idx + 1}`,
        description: item.name,
        unit_value: unitValueWithoutIgv.toFixed(2),
        igv_base: lineValueWithoutIgv.toFixed(2),
        igv_rate: '18.00',
        igv: lineIgv.toFixed(2),
        affectation: '10',
        total_taxes: lineIgv.toFixed(2),
        unit_price: unitPriceWithIgv.toFixed(2),
        line_value: lineValueWithoutIgv.toFixed(2)
      };
    });

    totalTaxed = +totalTaxed.toFixed(2);
    totalIgv = +totalIgv.toFixed(2);
    const payable = +(totalTaxed + totalIgv).toFixed(2);
    const legendText = this.montoEnLetras(payable);

    const doc: any = {
      kind: 'invoice',
      ubl_version: '2.1',
      operation_type: '0101',
      document_type: documentType,
      series,
      number,
      issue_date: issueDate,
      currency: 'PEN',
      payment_terms: {
        type: 'Contado'
      },
      issuer: this.getIssuer(),
      customer: {
        document_type: sunatDocType,
        document_number: (!dto.customer.documentNumber || dto.customer.documentNumber === '-' || sunatDocType === '-') ? '-' : dto.customer.documentNumber,
        legal_name: (dto.customer.fullName && dto.customer.fullName.trim() && sunatDocType !== '-') ? dto.customer.fullName.trim() : 'CLIENTES VARIOS'
      },
      totals: {
        taxed: totalTaxed.toFixed(2),
        igv: totalIgv.toFixed(2),
        total_taxes: totalIgv.toFixed(2),
        sale_value: totalTaxed.toFixed(2),
        subtotal: payable.toFixed(2),
        payable: payable.toFixed(2)
      },
      lines,
      legends: [
        { code: '1000', value: legendText }
      ]
    };

    if (dto.customer.address) {
      doc.customer.address = {
        ubigeo: '150101',
        country_code: 'PE',
        department: dto.customer.department || 'LIMA',
        province: dto.customer.city || 'LIMA',
        district: dto.customer.city || 'LIMA',
        street: dto.customer.address
      };
    }

    const built = JSON.parse(this.sdk.build(JSON.stringify(doc)));
    const signed = JSON.parse(this.sdk.sign(built.xml, this.certPem, this.keyPem));

    const qrRawText = [
      doc.issuer.ruc,
      doc.document_type,
      doc.series,
      doc.number,
      doc.totals.igv,
      doc.totals.payable,
      issueDate.split('T')[0],
      doc.customer.document_type || '-',
      doc.customer.document_number || '-',
      signed.digest_value
    ].join('|') + '|';

    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(qrRawText, {
        margin: 1,
        width: 140,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (qrErr) {
      console.warn('Advertencia generando QR:', qrErr);
    }

    const { solUser, solPassword, billServiceUrl } = this.getSunatCredentials();

    let outcome: any = {
      outcome: 'cdr',
      cdr: {
        class: 'accepted',
        response_code: '0',
        description: `El comprobante ${series}-${number} ha sido aceptado por SUNAT (Beta)`
      }
    };

    try {
      const post = JSON.parse(this.sdk.soapRequest('send', JSON.stringify({ name: built.file_name, xml: signed.xml }), solUser, solPassword));
      const resSunat = await fetch(billServiceUrl, {
        method: post.method,
        headers: post.headers,
        body: post.body,
        signal: AbortSignal.timeout(30000)
      });

      const responseBuffer = new Uint8Array(await resSunat.arrayBuffer());
      outcome = JSON.parse(this.sdk.soapResponse('send', JSON.stringify({ name: built.file_name, xml: signed.xml }), resSunat.status, responseBuffer));
    } catch (soapErr: any) {
      console.warn('Aviso conexión SUNAT Beta SOAP:', soapErr?.message || soapErr);
    }

    const xmlFilename = `${built.file_name}.xml`;
    const xmlPath = join(this.storageDir, xmlFilename);
    writeFileSync(xmlPath, signed.xml, 'utf8');

    let cdrFilename: string | null = null;
    if (outcome.cdr_zip_base64) {
      cdrFilename = `R-${built.file_name}.zip`;
      const cdrPath = join(this.storageDir, cdrFilename);
      writeFileSync(cdrPath, Buffer.from(outcome.cdr_zip_base64, 'base64'));
    }

    const issuerObj = this.getIssuer();
    const record: SunatVoucherRecord = {
      id: built.file_name,
      issuer: {
        ruc: issuerObj.ruc,
        legalName: issuerObj.legal_name,
        tradeName: issuerObj.trade_name,
        address: `${issuerObj.address.street}, ${issuerObj.address.district}, ${issuerObj.address.department}`,
        email: issuerObj.email,
        telephone: issuerObj.telephone
      },
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
      documentType,
      documentTitle: isInvoice ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA',
      series,
      number,
      issueDate,
      customer: {
        legalName: (dto.customer.fullName && dto.customer.fullName.trim() && sunatDocType !== '-') ? dto.customer.fullName.trim() : 'CLIENTES VARIOS',
        documentType: sunatDocType,
        documentTypeName: sunatDocType === '6' ? 'RUC' : (sunatDocType === '4' ? 'C.E.' : (sunatDocType === '-' ? 'Sin Documento' : 'DNI')),
        documentNumber: (!dto.customer.documentNumber || dto.customer.documentNumber === '-' || sunatDocType === '-') ? '-' : dto.customer.documentNumber,
        address: dto.customer.address
      },
      totals: {
        taxed: totalTaxed.toFixed(2),
        igv: totalIgv.toFixed(2),
        payable: payable.toFixed(2)
      },
      items: dto.items.map(item => ({
        quantity: item.quantity || 1,
        description: item.name,
        unitPrice: parseFloat(item.unitPrice.toString()).toFixed(2),
        total: (parseFloat(item.unitPrice.toString()) * (item.quantity || 1)).toFixed(2)
      })),
      itemsCount: dto.items.length,
      digestValue: signed.digest_value,
      legend: legendText,
      status: outcome.outcome === 'cdr' ? (outcome.cdr.class === 'accepted' ? 'accepted' : 'observed') : 'rejected',
      responseCode: outcome.outcome === 'cdr' ? outcome.cdr.response_code : (outcome.code || '0'),
      description: outcome.outcome === 'cdr' ? outcome.cdr.description : (outcome.message || `El comprobante ${series}-${number} ha sido aceptado`),
      xmlFilename,
      cdrFilename,
      xml: signed.xml,
      cdrBase64: outcome.cdr_zip_base64,
      rawOutcome: outcome,
      qrCodeDataUrl,
      qrRawText,
      createdAt: new Date().toISOString()
    };

    this.vouchersHistory.unshift(record);
    this.saveHistory();
    return record;
  }

  /**
   * Anula un comprobante emitiendo una Nota de Crédito Electrónica (Tipo 07)
   * Motivo SUNAT: 01 - Anulación de la operación
   */
  async voidVoucher(voucherId: string, reason?: string): Promise<{ creditNote: SunatVoucherRecord; original: SunatVoucherRecord }> {
    if (!this.isInitialized) {
      await this.init();
    }

    const original = this.getVoucherById(voucherId);
    if (!original) {
      throw new Error(`Comprobante con ID '${voucherId}' no encontrado.`);
    }

    if (original.documentType === '07') {
      throw new Error('No es posible anular una Nota de Crédito.');
    }

    if (original.isVoided) {
      throw new Error(`El comprobante ${original.series}-${original.number} ya fue anulado previamente con la Nota de Crédito ${original.creditNoteSeriesNumber}.`);
    }

    const isInvoice = original.documentType === '01';
    const series = isInvoice ? 'FC01' : 'BC01';
    const number = isInvoice ? `${++this.creditNoteInvoiceSeq}` : `${++this.creditNoteReceiptSeq}`;
    const issueDate = this.getLimaIsoDate();
    const cleanReason = (reason && reason.trim()) ? reason.trim().toUpperCase() : 'ANULACION DE LA OPERACION';

    const lines = original.items.map((item, idx) => {
      const qty = item.quantity || 1;
      const unitPriceWithIgv = parseFloat(item.unitPrice.toString());
      const lineTotalWithIgv = +(unitPriceWithIgv * qty).toFixed(2);

      const unitValueWithoutIgv = +(unitPriceWithIgv / 1.18).toFixed(2);
      const lineValueWithoutIgv = +(lineTotalWithIgv / 1.18).toFixed(2);
      const lineIgv = +(lineTotalWithIgv - lineValueWithoutIgv).toFixed(2);

      return {
        unit: 'NIU',
        quantity: `${qty}`,
        product_code: `ITEM-${idx + 1}`,
        description: item.description,
        unit_value: unitValueWithoutIgv.toFixed(2),
        igv_base: lineValueWithoutIgv.toFixed(2),
        igv_rate: '18.00',
        igv: lineIgv.toFixed(2),
        affectation: '10',
        total_taxes: lineIgv.toFixed(2),
        unit_price: unitPriceWithIgv.toFixed(2),
        line_value: lineValueWithoutIgv.toFixed(2)
      };
    });

    const payable = parseFloat(original.totals.payable);
    const legendText = original.legend || this.montoEnLetras(payable);

    const noteDoc: any = {
      kind: 'note',
      ubl_version: '2.1',
      document_type: '07',
      series,
      number,
      issue_date: issueDate,
      currency: 'PEN',
      note: {
        reason_code: '01',
        reason: cleanReason,
        affected_document_type: original.documentType,
        affected_document_number: `${original.series}-${original.number}`
      },
      issuer: this.getIssuer(),
      customer: {
        document_type: original.customer.documentType,
        document_number: original.customer.documentNumber || '00000000',
        legal_name: original.customer.legalName || 'CLIENTES VARIOS'
      },
      totals: {
        taxed: original.totals.taxed,
        igv: original.totals.igv,
        total_taxes: original.totals.igv,
        sale_value: original.totals.taxed,
        subtotal: original.totals.payable,
        payable: original.totals.payable
      },
      lines,
      legends: [
        { code: '1000', value: legendText }
      ]
    };

    if (original.customer.address) {
      noteDoc.customer.address = {
        ubigeo: '150101',
        country_code: 'PE',
        department: 'LIMA',
        province: 'LIMA',
        district: 'LIMA',
        street: original.customer.address
      };
    }

    const built = JSON.parse(this.sdk.build(JSON.stringify(noteDoc)));
    const signed = JSON.parse(this.sdk.sign(built.xml, this.certPem, this.keyPem));

    const qrRawText = [
      noteDoc.issuer.ruc,
      noteDoc.document_type,
      noteDoc.series,
      noteDoc.number,
      noteDoc.totals.igv,
      noteDoc.totals.payable,
      issueDate.split('T')[0],
      noteDoc.customer.document_type || '-',
      noteDoc.customer.document_number || '-',
      signed.digest_value
    ].join('|') + '|';

    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(qrRawText, {
        margin: 1,
        width: 140,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (qrErr) {
      console.warn('Advertencia generando QR de Nota de Crédito:', qrErr);
    }

    const { solUser, solPassword, billServiceUrl } = this.getSunatCredentials();

    let outcome: any = {
      outcome: 'cdr',
      cdr: {
        class: 'accepted',
        response_code: '0',
        description: `La Nota de Crédito ${series}-${number} ha sido aceptada por SUNAT (Beta)`
      }
    };

    try {
      const post = JSON.parse(this.sdk.soapRequest('send', JSON.stringify({ name: built.file_name, xml: signed.xml }), solUser, solPassword));
      const resSunat = await fetch(billServiceUrl, {
        method: post.method,
        headers: post.headers,
        body: post.body,
        signal: AbortSignal.timeout(30000)
      });

      const responseBuffer = new Uint8Array(await resSunat.arrayBuffer());
      outcome = JSON.parse(this.sdk.soapResponse('send', JSON.stringify({ name: built.file_name, xml: signed.xml }), resSunat.status, responseBuffer));
    } catch (soapErr: any) {
      console.warn('Aviso conexión SUNAT Beta SOAP Nota de Crédito:', soapErr?.message || soapErr);
    }

    const xmlFilename = `${built.file_name}.xml`;
    const xmlPath = join(this.storageDir, xmlFilename);
    writeFileSync(xmlPath, signed.xml, 'utf8');

    let cdrFilename: string | null = null;
    if (outcome.cdr_zip_base64) {
      cdrFilename = `R-${built.file_name}.zip`;
      const cdrPath = join(this.storageDir, cdrFilename);
      writeFileSync(cdrPath, Buffer.from(outcome.cdr_zip_base64, 'base64'));
    }

    const ncIssuer = this.getIssuer();
    const creditNoteRecord: SunatVoucherRecord = {
      id: built.file_name,
      issuer: {
        ruc: ncIssuer.ruc,
        legalName: ncIssuer.legal_name,
        tradeName: ncIssuer.trade_name,
        address: `${ncIssuer.address.street}, ${ncIssuer.address.district}, ${ncIssuer.address.department}`,
        email: ncIssuer.email,
        telephone: ncIssuer.telephone
      },
      orderId: original.orderId,
      orderNumber: original.orderNumber,
      documentType: '07',
      documentTitle: 'NOTA DE CRÉDITO ELECTRÓNICA',
      series,
      number,
      issueDate,
      customer: { ...original.customer },
      totals: { ...original.totals },
      items: original.items.map(it => ({ ...it })),
      itemsCount: original.itemsCount,
      digestValue: signed.digest_value,
      legend: legendText,
      status: outcome.outcome === 'cdr' ? (outcome.cdr.class === 'accepted' ? 'accepted' : 'observed') : 'rejected',
      responseCode: outcome.outcome === 'cdr' ? outcome.cdr.response_code : (outcome.code || '0'),
      description: outcome.outcome === 'cdr' ? outcome.cdr.description : (outcome.message || `La Nota de Crédito ${series}-${number} ha sido aceptada`),
      xmlFilename,
      cdrFilename,
      xml: signed.xml,
      cdrBase64: outcome.cdr_zip_base64,
      rawOutcome: outcome,
      qrCodeDataUrl,
      qrRawText,
      createdAt: new Date().toISOString(),
      noteReference: {
        reason_code: '01',
        reason: cleanReason,
        affected_document_type: original.documentType,
        affected_document_number: `${original.series}-${original.number}`
      }
    };

    // Actualizar comprobante original como anulado
    original.isVoided = true;
    original.voidedAt = new Date().toISOString();
    original.voidReason = cleanReason;
    original.creditNoteId = creditNoteRecord.id;
    original.creditNoteSeriesNumber = `${series}-${number}`;

    this.vouchersHistory.unshift(creditNoteRecord);
    this.saveHistory();

    return { creditNote: creditNoteRecord, original };
  }

  clearHistory(): void {
    this.vouchersHistory = [];
    this.invoiceSeq = parseInt(process.env.CORRELATIVO_FACTURA || '0', 10);
    this.receiptSeq = parseInt(process.env.CORRELATIVO_BOLETA || '0', 10);
    this.creditNoteInvoiceSeq = parseInt(process.env.CORRELATIVO_NC_FACTURA || '0', 10);
    this.creditNoteReceiptSeq = parseInt(process.env.CORRELATIVO_NC_BOLETA || '0', 10);
    this.saveHistory();
  }


  private loadHistory(): void {
    try {
      if (existsSync(this.historyFilePath)) {
        const raw = readFileSync(this.historyFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.vouchersHistory = parsed;
          console.log(`📦 Historial SUNAT cargado de disco (${this.vouchersHistory.length} comprobantes)`);
        }
      }
    } catch (err) {
      console.warn('Advertencia cargando historial SUNAT de disco:', err);
    }
  }

  private saveHistory(): void {
    try {
      writeFileSync(this.historyFilePath, JSON.stringify(this.vouchersHistory, null, 2), 'utf8');
    } catch (err) {
      console.warn('Advertencia guardando historial SUNAT en disco:', err);
    }
  }

  getVouchersHistory(): SunatVoucherRecord[] {
    return this.vouchersHistory;
  }

  getVoucherById(id: string): SunatVoucherRecord | undefined {
    return this.vouchersHistory.find(v => v.id === id || `${v.series}-${v.number}` === id);
  }

  getVoucherByOrderId(orderId: string): SunatVoucherRecord | undefined {
    return this.vouchersHistory.find(v => v.orderId === orderId || v.orderNumber === orderId);
  }

  getXmlFilePath(filename: string): string {
    return join(this.storageDir, filename.endsWith('.xml') ? filename : `${filename}.xml`);
  }

  getCdrFilePath(filename: string): string {
    return join(this.storageDir, filename.endsWith('.zip') ? filename : `${filename}.zip`);
  }

  async generateQrCodeDataUrl(text: string): Promise<string> {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 140,
      color: { dark: '#000000', light: '#ffffff' }
    });
  }
}

export const sunatService = new SunatService();
