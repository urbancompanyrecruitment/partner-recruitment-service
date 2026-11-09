import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { config } from '../../common/config/index.js';
import { pool, type Queryable } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { dayjs, nowIn, WALL_CLOCK_FORMAT, type Dayjs } from '../../common/time.js';
import {
  INTERVIEW_CITIES,
  SLOT_DATE_FORMAT,
  SLOT_END_HOUR,
  SLOT_ID_SEPARATOR,
  SLOT_START_HOUR,
  SLOT_TIME_FORMAT,
  SLOT_TIME_ZONE,
  SLOT_WINDOW_DAYS,
} from './constant.js';
import type { BookableSlot, InterviewCity, InterviewSlot, SlotDaySummary } from './interface.js';
import { countBookingsForSlot, findBookingByPartner, insertBooking, listBookingCounts } from './repository.js';

export const listCities = (): InterviewCity[] => INTERVIEW_CITIES;

export const getCity = (cityKey: string): InterviewCity | undefined => INTERVIEW_CITIES.find(city => city.key === cityKey);

export const slotIdOf = (cityKey: string, startsAt: string): string => {
  const start = dayjs(startsAt);

  return [cityKey, start.format(SLOT_DATE_FORMAT), start.format(SLOT_TIME_FORMAT)].join(SLOT_ID_SEPARATOR);
};

const toSlot = (cityKey: string, start: Dayjs): InterviewSlot => ({
  id: [cityKey, start.format(SLOT_DATE_FORMAT), start.format(SLOT_TIME_FORMAT)].join(SLOT_ID_SEPARATOR),
  cityKey,
  date: start.format(SLOT_DATE_FORMAT),
  time: start.format(SLOT_TIME_FORMAT),
  startsAt: start.format(WALL_CLOCK_FORMAT),
  timeZone: SLOT_TIME_ZONE,
  capacity: config.slotCapacity,
});

export const generateSlots = (now: Dayjs = nowIn(SLOT_TIME_ZONE)): InterviewSlot[] =>
  INTERVIEW_CITIES.flatMap(city =>
    Array.from({ length: SLOT_WINDOW_DAYS + 1 }, (_, dayOffset) => now.add(dayOffset, 'day'))
      .flatMap(day =>
        Array.from({ length: SLOT_END_HOUR - SLOT_START_HOUR }, (_, index) =>
          day.hour(SLOT_START_HOUR + index).minute(0).second(0).millisecond(0),
        ),
      )
      .filter(start => start.isAfter(now))
      .map(start => toSlot(city.key, start)),
  );

export const findOfferedSlot = (slotId: string, now: Dayjs = nowIn(SLOT_TIME_ZONE)): InterviewSlot | undefined =>
  generateSlots(now).find(slot => slot.id === slotId);

const slotKeyOf = (cityKey: string, startsAt: string): string => `${cityKey}|${startsAt}`;

const bookingCountMap = async (db: Queryable, fromDate: string): Promise<Map<string, number>> => {
  const rows = await listBookingCounts(db, fromDate);

  return new Map(rows.map(row => [slotKeyOf(row.city_key, row.starts_at), Number(row.total)]));
};

export const listBookableSlots = async (cityKey: string): Promise<BookableSlot[]> => {
  const now = nowIn(SLOT_TIME_ZONE);
  const booked = await bookingCountMap(pool, now.format(SLOT_DATE_FORMAT));

  return generateSlots(now)
    .filter(slot => slot.cityKey === cityKey)
    .map(slot => ({ ...slot, seatsLeft: slot.capacity - (booked.get(slotKeyOf(slot.cityKey, slot.startsAt)) ?? 0) }))
    .filter(slot => slot.seatsLeft > 0);
};

export const getSlotOccupancy = async (cityKey?: string): Promise<SlotDaySummary[]> => {
  const now = nowIn(SLOT_TIME_ZONE);
  const booked = await bookingCountMap(pool, now.format(SLOT_DATE_FORMAT));
  const slots = generateSlots(now).filter(slot => !cityKey || slot.cityKey === cityKey);
  const dayKeys = [...new Set(slots.map(slot => `${slot.date}|${slot.cityKey}`))];

  return dayKeys.map(dayKey => {
    const [date, city] = dayKey.split('|');
    const daySlots = slots.filter(slot => slot.date === date && slot.cityKey === city);

    return {
      date,
      cityKey: city,
      slots: daySlots.length,
      booked: daySlots.reduce((total, slot) => total + (booked.get(slotKeyOf(slot.cityKey, slot.startsAt)) ?? 0), 0),
      capacity: daySlots.reduce((total, slot) => total + slot.capacity, 0),
    };
  });
};

export const bookSlot = async (connection: PoolConnection, partnerId: string, slot: InterviewSlot): Promise<void> => {
  const booked = await countBookingsForSlot(connection, slot.cityKey, slot.startsAt);

  if (booked >= slot.capacity) throw new AppError(ErrorCode.SlotUnavailable, { slotId: slot.id });

  await insertBooking(connection, { id: randomUUID(), partnerId, cityKey: slot.cityKey, startsAt: slot.startsAt });
};

export const findPartnerSlot = async (db: Queryable, partnerId: string): Promise<InterviewSlot | undefined> => {
  const booking = await findBookingByPartner(db, partnerId);

  if (!booking) return undefined;

  return toSlot(booking.city_key, dayjs(booking.starts_at));
};

export { INTERVIEW_CITIES, SLOT_TIME_ZONE } from './constant.js';
export type { BookableSlot, InterviewCity, InterviewSlot, SlotDaySummary } from './interface.js';
