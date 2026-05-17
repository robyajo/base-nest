import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username must not exceed 50 characters'),
  email: z.string().email('Email must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters'),
  confirmPassword: z.string(),
  displayName: z.string().min(1).max(100).optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const VerifyEmailSchema = z.object({
  token: z.string(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Email must be a valid email address'),
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.union([z.string().url(), z.literal('')]).optional(),
  bio: z.string().max(500).optional(),
  whatsapp: z.string().max(20).optional(),
  instagram: z.string().max(100).optional(),
  tiktok: z.string().max(100).optional(),
  youtube: z.string().max(100).optional(),
  website: z.union([z.string().url(), z.literal('')]).optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
