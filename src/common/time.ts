import dayjs, { type Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const DB_DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

export const ISO_DATE_FORMAT = 'YYYY-MM-DD';

export const WALL_CLOCK_FORMAT = 'YYYY-MM-DD HH:mm:ss';

export const toIsoDateTime = (dbValue: string): string => dayjs.utc(dbValue, DB_DATE_TIME_FORMAT).toISOString();

export const toOptionalIsoDateTime = (dbValue: string | null): string | undefined =>
  dbValue ? toIsoDateTime(dbValue) : undefined;

export const nowIn = (timeZone: string): Dayjs => dayjs().tz(timeZone);

export const addHours = (date: Date, hours: number): Date => dayjs(date).add(hours, 'hour').toDate();

export const todayIsoDate = (): string => dayjs().format(ISO_DATE_FORMAT);

export { dayjs };
export type { Dayjs };
