import { Request, Response, NextFunction } from 'express';
import { getDbPool } from '../db/sqlServer.js';
import sql from 'mssql';

export interface CompanyAuthInfo {
  id: number;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  direccion: string;
  telefono?: string;
  email?: string;
  solUser: string;
  solPassword: string;
  sunatEndpoint: string;
  certPem: string;
  keyPem: string;
  apiKey: string;
}

declare global {
  namespace Express {
    interface Request {
      empresa?: CompanyAuthInfo;
    }
  }
}

/**
 * Middleware para validar el token X-API-KEY
 * En desarrollo permite peticiones locales usando la empresa WODITEK por defecto
 */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || req.query.apiKey;
  const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';

  try {
    const pool = await getDbPool();

    // 1. Si viene una API Key, buscar en la BD
    if (apiKey) {
      const result = await pool.request()
        .input('apiKey', sql.VarChar(64), apiKey)
        .query('SELECT * FROM dbo.Empresas WHERE ApiKey = @apiKey AND Estado = \'ACTIVO\'');

      if (result.recordset.length > 0) {
        const row = result.recordset[0];
        req.empresa = {
          id: row.Id,
          ruc: row.Ruc,
          razonSocial: row.RazonSocial,
          nombreComercial: row.NombreComercial,
          ubigeo: row.Ubigeo,
          departamento: row.Departamento,
          provincia: row.Provincia,
          distrito: row.Distrito,
          direccion: row.Direccion,
          telefono: row.Telefono,
          email: row.Email,
          solUser: row.SolUser,
          solPassword: row.SolPassword,
          sunatEndpoint: row.SunatEndpoint,
          certPem: row.CertPem,
          keyPem: row.KeyPem,
          apiKey: row.ApiKey
        };
        next();
        return;
      }

      res.status(403).json({
        success: false,
        message: 'Acceso Denegado: API Key no válida o empresa inactiva en el sistema.'
      });
      return;
    }

    // 2. Si es una petición local de desarrollo (del ecommerce de pruebas o localhost)
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.headers.origin?.includes('localhost');
    if (isLocalhost) {
      // Tomamos la primera empresa activa (Woditek) para mantener compatibilidad
      const defaultRes = await pool.request()
        .query('SELECT TOP 1 * FROM dbo.Empresas WHERE Estado = \'ACTIVO\' ORDER BY Id ASC');

      if (defaultRes.recordset.length > 0) {
        const row = defaultRes.recordset[0];
        req.empresa = {
          id: row.Id,
          ruc: row.Ruc,
          razonSocial: row.RazonSocial,
          nombreComercial: row.NombreComercial,
          ubigeo: row.Ubigeo,
          departamento: row.Departamento,
          provincia: row.Provincia,
          distrito: row.Distrito,
          direccion: row.Direccion,
          telefono: row.Telefono,
          email: row.Email,
          solUser: row.SolUser,
          solPassword: row.SolPassword,
          sunatEndpoint: row.SunatEndpoint,
          certPem: row.CertPem,
          keyPem: row.KeyPem,
          apiKey: row.ApiKey
        };
        next();
        return;
      }
    }

    // 3. Si no viene API Key y no es localhost
    res.status(401).json({
      success: false,
      message: 'Autenticación Requerida: Debes enviar el encabezado "X-API-KEY" para emitir comprobantes.'
    });
  } catch (error: any) {
    console.error('Error en autenticación API Key:', error);
    res.status(500).json({
      success: false,
      message: 'Error de servidor verificando credenciales de empresa.'
    });
  }
}
