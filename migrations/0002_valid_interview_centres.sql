UPDATE interview_slots
SET is_active = FALSE, updated_at = LOCALTIMESTAMP(3)
WHERE city_key NOT IN ('singapore', 'yangon');

UPDATE interview_slots
SET country = 'Myanmar', city_name = 'Yangon', centre = 'Yangon Interview Centre',
    address = 'Ye Tagon Tower (Pang Hlaing Tower), Pann Hlaing St, Yangon, Myanmar',
    time_zone = 'Asia/Yangon', updated_at = LOCALTIMESTAMP(3)
WHERE city_key = 'yangon';

INSERT INTO interview_slots (id, country, city_key, city_name, centre, address, instructions, time_zone, start_time, end_time, capacity, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, 'Singapore', 'singapore', 'Singapore', 'Singapore Interview Centre', '33 Maude Road #02-01, Singapore 208344',
       'Arrive 15 minutes early with your passport or work permit. Wear comfortable clothes for the practical test.',
       'Asia/Singapore', make_time(h.start_hour, 0, 0), make_time(h.start_hour + 1, 0, 0), 4, TRUE, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3)
FROM generate_series(8, 17) AS h (start_hour)
ON CONFLICT (city_key, start_time) DO NOTHING;
