CREATE DATABASE IF NOT EXISTS smart_parking;
 
USE smart_parking;
 
-- Parking records table
CREATE TABLE IF NOT EXISTS parking_records (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    slot_number      INT,
    entry_time       DATETIME,
    exit_time        DATETIME,
    duration_minutes FLOAT,
    amount_paid      FLOAT,
    status           VARCHAR(20)
);
 
-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    full_name    VARCHAR(100)        NOT NULL,
    email        VARCHAR(150)        NOT NULL UNIQUE,
    password     VARCHAR(255)        NOT NULL,  -- bcrypt hash
    created_at   DATETIME            DEFAULT NOW()
);
show tables;