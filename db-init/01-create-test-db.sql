-- Separate database for pytest so tests never touch dev data. Runs once, on first container start.
CREATE DATABASE rehab_test OWNER rehab;
