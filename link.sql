-- Run this in MySQL Workbench or MySQL command line
-- 1. Create the database
CREATE DATABASE IF NOT EXISTS finsphere_db;
USE finsphere_db;
select * from users;
-- 2. Create the users table
CREATE TABLE IF NOT EXISTS users (
id INT AUTO_INCREMENT PRIMARY KEY,
full_name VARCHAR(100) NOT NULL,
email VARCHAR(150) NOT NULL UNIQUE,
password_hash VARCHAR(255) NOT NULL,
is_verified BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
show tables;
select * from transactions;
select * from subscriptions;
-- 3. Create password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
id INT AUTO_INCREMENT PRIMARY KEY,
user_id INT NOT NULL,
token VARCHAR(255) NOT NULL UNIQUE,
expires_at TIMESTAMP NOT NULL,
used BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- 4. Verify tables were created
SHOW TABLES;
select * from password_reset_tokens;
-- ============================================================
-- FinSphere — Transactions Table Migration
-- Run this once in your MySQL database
-- ============================================================
drop table transactions;
CREATE TABLE IF NOT EXISTS transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  merchant        VARCHAR(150) NOT NULL,
  description     VARCHAR(500) DEFAULT NULL,
  category        ENUM('salary','freelance','investment','food','transport',
                       'shopping','health','utilities','entertain','travel','other') NOT NULL,
  type            ENUM('income','expense') NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  status          ENUM('completed','pending','failed') NOT NULL DEFAULT 'completed',
  txn_date        DATE NOT NULL,
  txn_time        TIME DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_txn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, txn_date),
  INDEX idx_user_type (user_id, type),
  INDEX idx_user_category (user_id, category)
);
select * from transactions;
show tables;
select * from subscriptions;
-- FinSphere: Budgets Table Migration
-- Run this AFTER your transactions table already exists

CREATE TABLE IF NOT EXISTS budgets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  category      ENUM(
                  'food','transport','shopping','health',
                  'utilities','entertain','travel','other'
                ) NOT NULL,
  monthly_limit DECIMAL(12,2) NOT NULL,
  month         VARCHAR(7) NOT NULL,   -- format: 'YYYY-MM'
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- One budget per category per month per user
  UNIQUE KEY unique_user_cat_month (user_id, category, month),

  CONSTRAINT fk_budget_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_budget_user_month (user_id, month)
);
-- ■ savings_goals table
-- Run this once in your MySQL database.
-- Assumes a `users` table with an `id` primary key already exists.

CREATE TABLE IF NOT EXISTS savings_goals (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id        INT      NOT NULL,
  name           VARCHAR(100)     NOT NULL,
  target_amount  DECIMAL(10,2)    NOT NULL,
  saved_amount   DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  deadline       DATE             NOT NULL,
  created_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_savings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_target_positive  CHECK (target_amount > 0),
  CONSTRAINT chk_saved_non_neg    CHECK (saved_amount  >= 0),
  CONSTRAINT chk_saved_lte_target CHECK (saved_amount  <= target_amount)
);
select * from savings_goals;
-- ■ subscriptions table
-- Run once in your MySQL database.

CREATE TABLE IF NOT EXISTS subscriptions (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id       INT             NOT NULL,
  name          VARCHAR(100)    NOT NULL,
  cycle         ENUM('daily','weekly','monthly','quarterly','annual') NOT NULL DEFAULT 'monthly',
  next_billing  DATE            NOT NULL,
  amount        DECIMAL(10,2)   NOT NULL,
  status        ENUM('active','unused','paused','cancelled')          NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_sub_amount CHECK (amount > 0)
);
-- ■ emergency_fund table
-- One row per user — upserted on every save.
-- Run once in your MySQL database.

CREATE TABLE IF NOT EXISTS emergency_fund (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id          INT            NOT NULL,
  fund             DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  monthly_savings  DECIMAL(10,2)  NOT NULL DEFAULT 500.00,
  coverage         TINYINT        NOT NULL DEFAULT 6,
  currency         VARCHAR(3)     NOT NULL DEFAULT '$',
  expenses         JSON           NOT NULL,
  updated_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_ef_user (user_id),
  CONSTRAINT fk_ef_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_ef_fund     CHECK (fund >= 0),
  CONSTRAINT chk_ef_savings  CHECK (monthly_savings >= 0),
  CONSTRAINT chk_ef_coverage CHECK (coverage IN (3, 4, 6, 9, 12))
);
select * from emergency_fund;

