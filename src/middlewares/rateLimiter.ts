import rateLimit from 'express-rate-limit';

/**
 * Limita peticiones a la API de facturación SUNAT
 * Máximo 60 peticiones por minuto por IP
 */
export const sunatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60, // Límite de 60 peticiones por minuto
  standardHeaders: true, // Devuelve info de rate limit en los headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*` antiguos
  message: {
    success: false,
    message: 'Demasiadas solicitudes a la API de SUNAT desde esta dirección. Por favor espera un minuto antes de reintentar.',
    error: 'TOO_MANY_REQUESTS'
  }
});
