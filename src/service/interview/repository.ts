import { count, execute, query, queryOne, type Queryable } from '../../common/db/index.js';
import type { BookingCountRow, BookingRow, InterviewCentre, NewBooking, NewSlotDefinition, SlotDefinitionRow } from './interface.js';

export const listActiveSlotDefinitions = (db: Queryable): Promise<SlotDefinitionRow[]> =>
  query<SlotDefinitionRow>(db, 'SELECT * FROM interview_slots WHERE is_active ORDER BY country, city_name, start_time');

export const countBookingsForSlot = (db: Queryable, cityKey: string, startsAt: string): Promise<number> =>
  count(db, 'SELECT COUNT(*) AS total FROM slot_bookings WHERE city_key = ? AND starts_at = ?', [cityKey, startsAt]);

export const listBookingCounts = (db: Queryable, fromDate: string): Promise<BookingCountRow[]> =>
  query<BookingCountRow>(
    db,
    'SELECT city_key, starts_at, COUNT(*) AS total FROM slot_bookings WHERE starts_at >= ? GROUP BY city_key, starts_at',
    [fromDate],
  );

export const findBookingByPartner = (db: Queryable, partnerId: string): Promise<BookingRow | undefined> =>
  queryOne<BookingRow>(
    db,
    `SELECT b.id, b.partner_id, b.slot_id, b.city_key, b.starts_at, s.time_zone, s.capacity
     FROM slot_bookings b
     LEFT JOIN interview_slots s ON s.id = b.slot_id
     WHERE b.partner_id = ?`,
    [partnerId],
  );

export const upsertBooking = (db: Queryable, booking: NewBooking): Promise<unknown> =>
  execute(
    db,
    `INSERT INTO slot_bookings (id, partner_id, slot_id, city_key, starts_at, created_at)
     VALUES (?, ?, ?, ?, ?, LOCALTIMESTAMP(3))
     ON CONFLICT (partner_id) DO UPDATE SET slot_id = EXCLUDED.slot_id, city_key = EXCLUDED.city_key, starts_at = EXCLUDED.starts_at`,
    [booking.id, booking.partnerId, booking.slotId ?? null, booking.cityKey, booking.startsAt],
  );

export const findSlotDefinition = (db: Queryable, cityKey: string, startTime: string): Promise<SlotDefinitionRow | undefined> =>
  queryOne<SlotDefinitionRow>(db, 'SELECT * FROM interview_slots WHERE city_key = ? AND start_time = ?', [cityKey, startTime]);

export const upsertSlotDefinition = (db: Queryable, slot: NewSlotDefinition): Promise<unknown> =>
  execute(
    db,
    `INSERT INTO interview_slots (
       id, country, city_key, city_name, centre, address, instructions, time_zone, start_time, end_time, capacity, is_active, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))
     ON CONFLICT (city_key, start_time) DO UPDATE
     SET end_time = EXCLUDED.end_time, capacity = EXCLUDED.capacity, is_active = TRUE, updated_at = EXCLUDED.updated_at`,
    [
      slot.id,
      slot.centre.country,
      slot.centre.key,
      slot.centre.cityName,
      slot.centre.name,
      slot.centre.address,
      slot.instructions,
      slot.centre.timeZone,
      slot.startTime,
      slot.endTime,
      slot.capacity,
    ],
  );

export const updateCentreDetails = (db: Queryable, centre: InterviewCentre): Promise<unknown> =>
  execute(
    db,
    `UPDATE interview_slots
     SET country = ?, city_name = ?, centre = ?, address = ?, time_zone = ?, updated_at = LOCALTIMESTAMP(3)
     WHERE city_key = ?`,
    [centre.country, centre.cityName, centre.name, centre.address, centre.timeZone, centre.key],
  );
