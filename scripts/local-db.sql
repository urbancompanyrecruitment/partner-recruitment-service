SELECT 'CREATE ROLE recruitment LOGIN PASSWORD ''recruitment''' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'recruitment')\gexec
SELECT 'CREATE DATABASE partner_recruitment OWNER recruitment' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'partner_recruitment')\gexec
SELECT 'CREATE DATABASE partner_recruitment_test OWNER recruitment' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'partner_recruitment_test')\gexec
