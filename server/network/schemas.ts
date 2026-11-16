import { z } from 'zod';
import { VERTICALS } from '../../shared/constants';
import { isIsoDate } from '../lib/dates';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s()-]{8,24}$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,47}$/;

const text = (max: number) => z.string().trim().min(1, 'Обязательное поле.').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не больше ${max} символов.`)
    .nullable()
    .optional();

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .refine((value) => emailPattern.test(value), 'Некорректный email.');

export const passwordSchema = z
  .string()
  .min(8, 'Пароль — не короче 8 символов.')
  .max(128, 'Пароль — не длиннее 128 символов.')
  .refine((value) => /[a-zA-Zа-яА-Я]/.test(value), 'Пароль должен содержать букву.')
  .refine((value) => /\d/.test(value), 'Пароль должен содержать цифру.');

export const registerSchema = z
  .object({
    businessName: text(120),
    vertical: z.enum(VERTICALS),
    email: emailSchema,
    name: text(120),
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Введите пароль.').max(128),
  })
  .strict();

export const tenantCreateSchema = z
  .object({
    name: text(120),
    vertical: z.enum(VERTICALS),
    slug: z.string().trim().toLowerCase().regex(slugPattern, 'Латиница, цифры и дефис.').optional(),
  })
  .strict();

export const siteProfileSchema = z
  .object({
    name: text(120),
    slug: z.string().trim().toLowerCase().regex(slugPattern, 'Латиница, цифры и дефис.'),
    tagline: optionalText(160),
    description: optionalText(2000),
    city: optionalText(120),
    address: optionalText(200),
    phone: optionalText(32),
    email: z
      .union([z.literal(''), emailSchema])
      .nullable()
      .optional(),
    workingHours: optionalText(120),
    brandColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB.'),
    coverUrl: optionalText(500),
  })
  .strict();

export const sitePublishSchema = z.object({ isPublished: z.boolean() }).strict();

const itemFields = {
  name: text(120),
  description: optionalText(1000),
  priceMinor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  durationMin: z.number().int().min(1).max(24 * 60).nullable().optional(),
  capacity: z.number().int().min(1).max(500).nullable().optional(),
  imageUrl: optionalText(500),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
};

export const siteItemCreateSchema = z.object(itemFields).strict();
export const siteItemUpdateSchema = z
  .object(itemFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Нужно хотя бы одно поле.');

export const publicRequestSchema = z
  .object({
    guestName: text(120),
    phone: z
      .string()
      .trim()
      .max(32)
      .refine((value) => phonePattern.test(value), 'Укажите телефон для связи.'),
    email: z.union([z.literal(''), emailSchema]).nullable().optional(),
    requestedDate: z
      .string()
      .trim()
      .refine(isIsoDate, 'Ожидается дата в формате YYYY-MM-DD.')
      .nullable()
      .optional(),
    requestedTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ожидается время в формате ЧЧ:ММ.')
      .nullable()
      .optional(),
    checkOut: z
      .string()
      .trim()
      .refine(isIsoDate, 'Ожидается дата в формате YYYY-MM-DD.')
      .nullable()
      .optional(),
    guests: z.number().int().min(1).max(100).nullable().optional(),
    itemId: z.number().int().positive().nullable().optional(),
    comment: optionalText(2000),
  })
  .strict();

export const siteRequestStatusSchema = z
  .object({ status: z.enum(['new', 'contacted', 'qualified', 'disqualified']) })
  .strict();
