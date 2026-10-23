import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import sql from 'mssql';
import { getDbPool } from '../db/sqlServer.js';

export const companyRouter = Router();

/**
 * GET /api/companies/stats
 * Resumen global de empresas y comprobantes emitidos en SQL Server
 */
companyRouter.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getDbPool();

    const companiesRes = await pool.request().query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN Estado = 'ACTIVO' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN Estado <> 'ACTIVO' THEN 1 ELSE 0 END) as inactive
      FROM dbo.Empresas
    `);

    const vouchersRes = await pool.request().query(`
      SELECT 
        COUNT(*) as totalVouchers,
        SUM(CASE WHEN TipoDocumento = '03' THEN 1 ELSE 0 END) as totalBoletas,
        SUM(CASE WHEN TipoDocumento = '01' THEN 1 ELSE 0 END) as totalFacturas,
        SUM(CASE WHEN TipoDocumento = '07' THEN 1 ELSE 0 END) as totalNotas,
        ISNULL(SUM(MontoTotal), 0) as totalFacturado
      FROM dbo.Comprobantes
    `);

    res.status(200).json({
      success: true,
      stats: {
        companies: companiesRes.recordset[0],
        vouchers: vouchersRes.recordset[0]
      }
    });
  } catch (error: any) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/companies
 * Lista todas las empresas registradas con sus series y métricas
 */
companyRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getDbPool();

    const empresasQuery = await pool.request().query(`
      SELECT 
        e.Id,
        e.Ruc,
        e.RazonSocial,
        e.NombreComercial,
        e.Ubigeo,
        e.Departamento,
        e.Provincia,
        e.Distrito,
        e.Direccion,
        e.Telefono,
        e.Email,
        e.SolUser,
        e.SunatEndpoint,
        e.ApiKey,
        e.Estado,
        e.CreatedAt,
        e.UpdatedAt,
        (SELECT COUNT(*) FROM dbo.Comprobantes c WHERE c.EmpresaId = e.Id) as ComprobantesEmitidos,
        CASE WHEN e.CertPem IS NOT NULL AND LEN(e.CertPem) > 50 THEN 1 ELSE 0 END as TieneCertificado,
        CASE WHEN e.KeyPem IS NOT NULL AND LEN(e.KeyPem) > 50 THEN 1 ELSE 0 END as TieneLlavePrivada
      FROM dbo.Empresas e
      ORDER BY e.Id ASC
    `);

    const seriesQuery = await pool.request().query(`
      SELECT EmpresaId, TipoDocumento, Serie, UltimoNumero
      FROM dbo.SeriesCorrelativos
      ORDER BY EmpresaId, TipoDocumento, Serie
    `);

    const companies = empresasQuery.recordset.map(emp => {
      const series = seriesQuery.recordset.filter(s => s.EmpresaId === emp.Id);
      return {
        ...emp,
        Series: series
      };
    });

    res.status(200).json({
      success: true,
      count: companies.length,
      companies
    });
  } catch (error: any) {
    console.error('Error listando empresas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/companies
 * Registra una nueva empresa y genera automáticamente su API Key y series iniciales
 */
companyRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await getDbPool();
    const data = req.body;

    if (!data.ruc || !/^\d{11}$/.test(data.ruc.trim())) {
      res.status(400).json({ success: false, message: 'El RUC debe tener exactamente 11 dígitos numéricos.' });
      return;
    }

    if (!data.razonSocial || !data.direccion) {
      res.status(400).json({ success: false, message: 'Razón Social y Dirección fiscal son campos obligatorios.' });
      return;
    }

    // Verificar si ya existe el RUC
    const existing = await pool.request()
      .input('ruc', sql.VarChar(11), data.ruc.trim())
      .query('SELECT Id FROM dbo.Empresas WHERE Ruc = @ruc');

    if (existing.recordset.length > 0) {
      res.status(409).json({ success: false, message: `Ya existe una empresa registrada con el RUC ${data.ruc}.` });
      return;
    }

    // Generar API Key única si no se envió una personalizada
    let generatedApiKey = data.apiKey?.trim();
    if (!generatedApiKey) {
      const prefix = data.nombreComercial ? data.nombreComercial.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : 'emp';
      generatedApiKey = `${prefix}_live_${crypto.randomBytes(12).toString('hex')}`;
    }

    const solUser = data.solUser?.trim() || `${data.ruc.trim()}MODDATOS`;
    const solPassword = data.solPassword?.trim() || 'moddatos';
    const sunatEndpoint = data.sunatEndpoint?.trim() || 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';
    const certPem = data.certPem?.trim() || '';
    const keyPem = data.keyPem?.trim() || '';

    // Insertar Empresa
    const insertRes = await pool.request()
      .input('ruc', sql.VarChar(11), data.ruc.trim())
      .input('razonSocial', sql.VarChar(250), data.razonSocial.trim().toUpperCase())
      .input('nombreComercial', sql.VarChar(250), data.nombreComercial ? data.nombreComercial.trim().toUpperCase() : null)
      .input('ubigeo', sql.VarChar(6), data.ubigeo?.trim() || '150131')
      .input('departamento', sql.VarChar(50), data.departamento?.trim().toUpperCase() || 'LIMA')
      .input('provincia', sql.VarChar(50), data.provincia?.trim().toUpperCase() || 'LIMA')
      .input('distrito', sql.VarChar(50), data.distrito?.trim().toUpperCase() || 'SAN ISIDRO')
      .input('direccion', sql.VarChar(250), data.direccion.trim().toUpperCase())
      .input('telefono', sql.VarChar(50), data.telefono?.trim() || null)
      .input('email', sql.VarChar(100), data.email?.trim() || null)
      .input('solUser', sql.VarChar(100), solUser)
      .input('solPassword', sql.VarChar(100), solPassword)
      .input('sunatEndpoint', sql.VarChar(250), sunatEndpoint)
      .input('certPem', sql.VarChar(sql.MAX), certPem)
      .input('keyPem', sql.VarChar(sql.MAX), keyPem)
      .input('apiKey', sql.VarChar(64), generatedApiKey)
      .input('estado', sql.VarChar(20), 'ACTIVO')
      .query(`
        INSERT INTO dbo.Empresas (
          Ruc, RazonSocial, NombreComercial, Ubigeo, Departamento, Provincia, Distrito, Direccion,
          Telefono, Email, SolUser, SolPassword, SunatEndpoint, CertPem, KeyPem, ApiKey, Estado
        )
        OUTPUT INSERTED.Id, INSERTED.Ruc, INSERTED.RazonSocial, INSERTED.ApiKey, INSERTED.Estado, INSERTED.CreatedAt
        VALUES (
          @ruc, @razonSocial, @nombreComercial, @ubigeo, @departamento, @provincia, @distrito, @direccion,
          @telefono, @email, @solUser, @solPassword, @sunatEndpoint, @certPem, @keyPem, @apiKey, @estado
        )
      `);

    const newEmpresa = insertRes.recordset[0];
    const empresaId = newEmpresa.Id;

    // Crear Series por Defecto: Boleta B001, Factura F001, Notas BC01, FC01
    const defaultSeries = [
      { tipo: '03', serie: data.serieBoleta?.trim() || 'B001', ult: 0 },
      { tipo: '01', serie: data.serieFactura?.trim() || 'F001', ult: 0 },
      { tipo: '07', serie: data.serieNotaBoleta?.trim() || 'BC01', ult: 0 },
      { tipo: '07', serie: data.serieNotaFactura?.trim() || 'FC01', ult: 0 }
    ];

    for (const s of defaultSeries) {
      await pool.request()
        .input('empresaId', sql.Int, empresaId)
        .input('tipo', sql.VarChar(2), s.tipo)
        .input('serie', sql.VarChar(4), s.serie.toUpperCase())
        .input('ult', sql.Int, s.ult)
        .query(`
          INSERT INTO dbo.SeriesCorrelativos (EmpresaId, TipoDocumento, Serie, UltimoNumero)
          VALUES (@empresaId, @tipo, @serie, @ult)
        `);
    }

    res.status(201).json({
      success: true,
      message: `Empresa ${newEmpresa.RazonSocial} registrada exitosamente con API Key.`,
      company: newEmpresa,
      apiKey: generatedApiKey
    });
  } catch (error: any) {
    console.error('Error registrando empresa:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/companies/:id/status
 * Cambia el estado (ACTIVO / INACTIVO) de una empresa
 */
companyRouter.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { status } = req.body;

    if (!['ACTIVO', 'INACTIVO'].includes(status)) {
      res.status(400).json({ success: false, message: 'Estado debe ser ACTIVO o INACTIVO' });
      return;
    }

    const pool = await getDbPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('estado', sql.VarChar(20), status)
      .query(`
        UPDATE dbo.Empresas 
        SET Estado = @estado, UpdatedAt = GETDATE()
        OUTPUT INSERTED.Id, INSERTED.Ruc, INSERTED.RazonSocial, INSERTED.Estado
        WHERE Id = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, message: 'Empresa no encontrada' });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Empresa ${result.recordset[0].RazonSocial} actualizada a ${status}`,
      company: result.recordset[0]
    });
  } catch (error: any) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/companies/:id/regenerate-key
 * Regenera una nueva API Key para la empresa
 */
companyRouter.post('/:id/regenerate-key', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const pool = await getDbPool();

    // Obtener la empresa para usar su nombre en el prefijo
    const empRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT NombreComercial, RazonSocial FROM dbo.Empresas WHERE Id = @id');

    if (empRes.recordset.length === 0) {
      res.status(404).json({ success: false, message: 'Empresa no encontrada' });
      return;
    }

    const name = empRes.recordset[0].NombreComercial || empRes.recordset[0].RazonSocial;
    const prefix = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const newApiKey = `${prefix}_live_${crypto.randomBytes(12).toString('hex')}`;

    await pool.request()
      .input('id', sql.Int, id)
      .input('apiKey', sql.VarChar(64), newApiKey)
      .query('UPDATE dbo.Empresas SET ApiKey = @apiKey, UpdatedAt = GETDATE() WHERE Id = @id');

    res.status(200).json({
      success: true,
      message: 'Nueva API Key generada con éxito.',
      apiKey: newApiKey
    });
  } catch (error: any) {
    console.error('Error regenerando API Key:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
