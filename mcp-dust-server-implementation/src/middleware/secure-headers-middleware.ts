// src/middleware/secure-headers-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Secure headers middleware options
 */
export interface SecureHeadersOptions {
  /**
   * Whether to enable Content-Security-Policy
   */
  enableCSP?: boolean;
  
  /**
   * Whether to enable X-XSS-Protection
   */
  enableXSSProtection?: boolean;
  
  /**
   * Whether to enable X-Content-Type-Options
   */
  enableNoSniff?: boolean;
  
  /**
   * Whether to enable X-Frame-Options
   */
  enableFrameOptions?: boolean;
  
  /**
   * Whether to enable Strict-Transport-Security
   */
  enableHSTS?: boolean;
  
  /**
   * Whether to enable Referrer-Policy
   */
  enableReferrerPolicy?: boolean;
  
  /**
   * Whether to enable Feature-Policy
   */
  enableFeaturePolicy?: boolean;
  
  /**
   * Whether to enable Permissions-Policy
   */
  enablePermissionsPolicy?: boolean;
  
  /**
   * Whether to enable Cache-Control
   */
  enableCacheControl?: boolean;
  
  /**
   * Whether to enable Expect-CT
   */
  enableExpectCT?: boolean;
}

/**
 * Create secure headers middleware
 * @param options Secure headers options
 * @returns Secure headers middleware
 */
export function createSecureHeadersMiddleware(options: SecureHeadersOptions = {}) {
  const {
    enableCSP = true,
    enableXSSProtection = true,
    enableNoSniff = true,
    enableFrameOptions = true,
    enableHSTS = true,
    enableReferrerPolicy = true,
    enableFeaturePolicy = true,
    enablePermissionsPolicy = true,
    enableCacheControl = true,
    enableExpectCT = true,
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Content-Security-Policy
      if (enableCSP) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'"
        );
      }
      
      // X-XSS-Protection
      if (enableXSSProtection) {
        res.setHeader('X-XSS-Protection', '1; mode=block');
      }
      
      // X-Content-Type-Options
      if (enableNoSniff) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      
      // X-Frame-Options
      if (enableFrameOptions) {
        res.setHeader('X-Frame-Options', 'DENY');
      }
      
      // Strict-Transport-Security
      if (enableHSTS) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
      
      // Referrer-Policy
      if (enableReferrerPolicy) {
        res.setHeader('Referrer-Policy', 'no-referrer');
      }
      
      // Feature-Policy (deprecated but still supported by some browsers)
      if (enableFeaturePolicy) {
        res.setHeader(
          'Feature-Policy',
          "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; vr 'none'; accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'none'; document-domain 'none'; encrypted-media 'none'; fullscreen 'self'; gyroscope 'none'; magnetometer 'none'; midi 'none'; picture-in-picture 'none'; speaker 'none'; sync-xhr 'none'; xr-spatial-tracking 'none'"
        );
      }
      
      // Permissions-Policy (successor to Feature-Policy)
      if (enablePermissionsPolicy) {
        res.setHeader(
          'Permissions-Policy',
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), vr=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), document-domain=(), encrypted-media=(), fullscreen=(self), gyroscope=(), magnetometer=(), midi=(), picture-in-picture=(), speaker=(), sync-xhr=(), xr-spatial-tracking=()"
        );
      }
      
      // Cache-Control
      if (enableCacheControl) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      
      // Expect-CT
      if (enableExpectCT) {
        res.setHeader('Expect-CT', 'enforce, max-age=86400');
      }
      
      next();
    } catch (error) {
      logger.error(`Secure headers middleware error: ${error.message}`);
      next(error);
    }
  };
}
