import jwt from 'jsonwebtoken';
import http from 'http';

export interface JwtPayload {
  userId: string;
  email: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = '7d';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extract JWT from:
 *  1. Authorization: Bearer <token>
 *  2. Cookie: token=<token>
 *  3. Query param ?token=<token> (for SSE connections)
 */
export function extractToken(req: http.IncomingMessage, url?: URL): string | null {
  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. Cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.split(';').find(c => c.trim().startsWith('token='));
    if (match) {
      return match.split('=').slice(1).join('=').trim();
    }
  }

  // 3. Query param (for SSE)
  if (url) {
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) return tokenParam;
  }

  return null;
}

/**
 * Authenticate a request. Returns the JWT payload or null.
 */
export function authenticateRequest(req: http.IncomingMessage, url?: URL): JwtPayload | null {
  const token = extractToken(req, url);
  if (!token) return null;
  return verifyToken(token);
}
