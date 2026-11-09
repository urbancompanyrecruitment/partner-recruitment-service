import { count, execute, query, queryOne, type Queryable } from '../../common/db/index.js';
import type { BookingCountRow, BookingRow, NewBooking } from './interface.js';

export const countBookingsForSlot = (db: Queryable, cityKey: string, startsAt: string): Promise<number> =>
  count(db, 'SELECT COUNT(*) AS total FROM slot_bookings WHERE city_key = ? AND starts_at = ?', [cityKey, startsAt]);

export const listBookingCounts = (db: Queryable, fromDate: string): Promise<BookingCountRow[]> =>
  query<BookingCountRow>(
    db,
    'SELECT city_key, starts_at, COUNT(*) AS total FROM slot_bookings WHERE starts_at >= ? GROUP BY city_key, starts_at',
    [fromDate],
  );

export const findBookingByPartner = (db: Queryable, partnerId: string): Promise<BookingRow | undefined> =>
  queryOne<BookingRow>(db, 'SELECT id, partner_id, city_key, starts_at FROM slot_bookings WHERE partner_id = ?', [partnerId]);

export const insertBooking = (db: Queryable, booking: NewBooking): Promise<unknown> =>
  execute(db, 'INSERT INTO slot_bookings (id, partner_id, city_key, starts_at, created_at) VALUES (?, ?, ?, ?, NOW(3))', [
    booking.id,
    booking.partnerId,
    booking.cityKey,
    booking.startsAt,
  ]);
