import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_SECRET || 'reviewsync-dev-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'reviewsync-dev-refresh-secret';

const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_DAYS = 7;

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_EXPIRES_DAYS);
  return expiry;
}
