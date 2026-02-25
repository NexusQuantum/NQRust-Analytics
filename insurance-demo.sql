-- Insurance Company Database Schema
-- Source: https://github.com/Kielx/Insurance-company-database
-- Converted from Oracle to PostgreSQL

CREATE TABLE region (
    region_id   INTEGER PRIMARY KEY,
    region_name VARCHAR(50) NOT NULL
);

CREATE TABLE city (
    city_id   INTEGER PRIMARY KEY,
    city_name VARCHAR(50) NOT NULL
);

CREATE TABLE street (
    street_id   INTEGER PRIMARY KEY,
    street_name VARCHAR(50) NOT NULL
);

CREATE TABLE housenr (
    housenr_id INTEGER PRIMARY KEY,
    housenr_nr VARCHAR(10) NOT NULL
);

CREATE TABLE claimstatus (
    cs_id     INTEGER PRIMARY KEY,
    cs_status VARCHAR(50) NOT NULL
);

CREATE TABLE clienttype (
    clienttype_id   INTEGER PRIMARY KEY,
    clienttype_name VARCHAR(50) NOT NULL
);

CREATE TABLE insurancetype (
    insurancetype_id INTEGER PRIMARY KEY,
    insurance_type   VARCHAR(50) NOT NULL
);

CREATE TABLE phonetype (
    phonetype_id INTEGER PRIMARY KEY,
    type_name    VARCHAR(50) NOT NULL
);

CREATE TABLE payment (
    payment_id     INTEGER PRIMARY KEY,
    payment_type   VARCHAR(50) NOT NULL,
    payment_amount INTEGER,
    payment_date   DATE
);

CREATE TABLE branch (
    branch_id   INTEGER PRIMARY KEY,
    branch_name VARCHAR(50) NOT NULL,
    region_id   INTEGER NOT NULL REFERENCES region(region_id),
    city_id     INTEGER NOT NULL REFERENCES city(city_id),
    street_id   INTEGER NOT NULL REFERENCES street(street_id),
    housenr_id  INTEGER NOT NULL REFERENCES housenr(housenr_id)
);

CREATE TABLE client (
    client_id     INTEGER PRIMARY KEY,
    first_name    VARCHAR(50) NOT NULL,
    last_name     VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    region_id     INTEGER NOT NULL REFERENCES region(region_id),
    city_id       INTEGER NOT NULL REFERENCES city(city_id),
    street_id     INTEGER NOT NULL REFERENCES street(street_id),
    housenr_id    INTEGER NOT NULL REFERENCES housenr(housenr_id),
    clienttype_id INTEGER NOT NULL REFERENCES clienttype(clienttype_id),
    discount      INTEGER
);

CREATE TABLE employee (
    employee_id        INTEGER PRIMARY KEY,
    first_name         VARCHAR(50) NOT NULL,
    last_name          VARCHAR(50) NOT NULL,
    date_of_birth      DATE NOT NULL,
    region_id          INTEGER NOT NULL REFERENCES region(region_id),
    city_id            INTEGER NOT NULL REFERENCES city(city_id),
    street_id          INTEGER NOT NULL REFERENCES street(street_id),
    housenr_id         INTEGER NOT NULL REFERENCES housenr(housenr_id),
    date_of_employment DATE,
    salary             INTEGER
);

CREATE TABLE insurance (
    insurance_id     INTEGER PRIMARY KEY,
    insurance_number VARCHAR(50) NOT NULL,
    client_id        INTEGER NOT NULL REFERENCES client(client_id),
    employee_id      INTEGER NOT NULL REFERENCES employee(employee_id),
    begin_date       DATE NOT NULL,
    expiration_date  DATE NOT NULL,
    insurancetype_id INTEGER NOT NULL REFERENCES insurancetype(insurancetype_id),
    payment_id       INTEGER NOT NULL REFERENCES payment(payment_id),
    branch_id        INTEGER NOT NULL REFERENCES branch(branch_id),
    price            INTEGER
);

CREATE TABLE claim (
    claim_id     INTEGER PRIMARY KEY,
    claim_name   VARCHAR(50) NOT NULL,
    insurance_id INTEGER NOT NULL REFERENCES insurance(insurance_id),
    claim_amount INTEGER,
    cs_id        INTEGER NOT NULL REFERENCES claimstatus(cs_id)
);

CREATE TABLE phone (
    phone_id     INTEGER PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    client_id    INTEGER REFERENCES client(client_id),
    phonetype_id INTEGER NOT NULL REFERENCES phonetype(phonetype_id),
    employee_id  INTEGER REFERENCES employee(employee_id),
    branch_id    INTEGER REFERENCES branch(branch_id)
);
