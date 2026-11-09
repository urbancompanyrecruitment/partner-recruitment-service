CREATE DATABASE IF NOT EXISTS partner_recruitment CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS partner_recruitment_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'recruitment'@'localhost' IDENTIFIED BY 'recruitment';
CREATE USER IF NOT EXISTS 'recruitment'@'127.0.0.1' IDENTIFIED BY 'recruitment';
GRANT ALL PRIVILEGES ON partner_recruitment.* TO 'recruitment'@'localhost', 'recruitment'@'127.0.0.1';
GRANT ALL PRIVILEGES ON partner_recruitment_test.* TO 'recruitment'@'localhost', 'recruitment'@'127.0.0.1';
FLUSH PRIVILEGES;
