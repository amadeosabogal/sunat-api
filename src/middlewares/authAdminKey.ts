import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de seguridad para proteger rutas administrativas (/api/companies).
 * Requiere el encabezado "X-ADMIN-KEY" o "Authorization: Bearer <ADMIN_KEY>"
 * correspondiente a la llave maestra configurada en ADMIN_API_KEY.
 */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const masterKey = process.env.ADMIN_API_KEY || 'woditek_master_admin_2026_x89';

  const rawKey = req.headers['x-admin-key'] || 
                 req.headers['authorization']?.replace(/^Bearer\s+/i, '') || 
                 req.query.adminKey;

  const providedKey = typeof rawKey === 'string' ? rawKey.trim() : '';

  if (providedKey && providedKey === masterKey) {
    return next();
  }

  res.status(403).json({
    success: false,
    message: 'Acceso Denegado: Se requiere una Llave Maestra de Administrador (X-ADMIN-KEY) válida para gestionar empresas.',
    error: 'FORBIDDEN_ADMIN_ACCESS'
  });
}
