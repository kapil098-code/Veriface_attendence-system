import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';

const SIGNING_SECRET: string =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

export interface AdminSessionPayload {
  admin_id: number;
  name: string;
  email: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  admin?: AdminSessionPayload;
  isEngineClient?: boolean;
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = storedHash.split(':');
    if (parts.length !== 2) {
      resolve(false);
      return;
    }
    const [salt, expectedHex] = parts;
    if (!salt || !expectedHex) {
      resolve(false);
      return;
    }
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        resolve(false);
        return;
      }
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      if (expectedBuf.length !== derivedKey.length) {
        resolve(false);
        return;
      }
      resolve(crypto.timingSafeEqual(expectedBuf, derivedKey));
    });
  });
}

export function signAdminToken(payload: Omit<AdminSessionPayload, 'exp'>): string {
  const fullPayload: AdminSessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAdminToken(token: string): AdminSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as AdminSessionPayload;
    if (!parsed || typeof parsed.admin_id !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({error: 'Authentication required'});
    return;
  }
  const session = verifyAdminToken(token);
  if (!session) {
    res.status(401).json({error: 'Session expired or invalid'});
    return;
  }
  req.admin = session;
  next();
}

export function requireAdminOrEngineAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = extractBearerToken(req);
  if (token) {
    const session = verifyAdminToken(token);
    if (session) {
      req.admin = session;
      next();
      return;
    }
  }

  const configuredEngineKey = process.env.FACE_ENGINE_API_KEY?.trim();
  const providedEngineKey = req.headers['x-engine-key'];
  if (
    configuredEngineKey &&
    typeof providedEngineKey === 'string' &&
    providedEngineKey.length === configuredEngineKey.length &&
    crypto.timingSafeEqual(
      Buffer.from(providedEngineKey, 'utf8'),
      Buffer.from(configuredEngineKey, 'utf8'),
    )
  ) {
    req.isEngineClient = true;
    next();
    return;
  }

  res.status(401).json({error: 'Valid admin session or engine API key required'});
}
