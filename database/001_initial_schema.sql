-- ============================================================
-- 001_initial_schema.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: settings
-- One row per user. Stores company info, preferences, sharing.
-- ============================================================
CREATE TABLE settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Business info
    company_name    TEXT NOT NULL DEFAULT '',
    hst_number      TEXT NOT NULL DEFAULT '',
    address         TEXT NOT NULL DEFAULT '',
    phone           TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL DEFAULT '',

    -- Invoice preferences
    invoice_prefix  TEXT NOT NULL DEFAULT 'INV-',
    hst_rate        NUMERIC(5,2) NOT NULL DEFAULT 13.00,

    -- Google Drive
    drive_folder_id TEXT,
    drive_connected BOOLEAN NOT NULL DEFAULT FALSE,

    -- Public sharing
    share_token     UUID UNIQUE DEFAULT uuid_generate_v4(),
    shared_pages    TEXT[] NOT NULL DEFAULT '{}',
    sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT settings_user_unique UNIQUE (user_id)
);

-- ============================================================
-- TABLE: clients
-- Billing entities (the company you invoice).
-- ============================================================
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    address             TEXT NOT NULL DEFAULT '',
    phone               TEXT NOT NULL DEFAULT '',
    email               TEXT NOT NULL DEFAULT '',
    consulting_client   TEXT NOT NULL DEFAULT '',   -- e.g. "CIBC"
    payment_terms_days  INTEGER NOT NULL DEFAULT 15,
    hourly_rate         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: invoices
-- One row per invoice.
-- ============================================================
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

    -- Numbering: INV-2026001 format
    invoice_number  TEXT NOT NULL,
    invoice_year    INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL,

    invoice_date    DATE NOT NULL,
    due_date        DATE NOT NULL,

    -- Financials (computed from lines, stored for fast reads)
    subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    hst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 13.00,
    hst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_hours     NUMERIC(8,2)  NOT NULL DEFAULT 0.00,

    -- Workflow
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid')),

    -- Google Drive
    drive_file_id   TEXT,
    drive_file_url  TEXT,
    drive_uploaded_at TIMESTAMPTZ,

    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One invoice number per user per year
    CONSTRAINT invoices_number_unique UNIQUE (user_id, invoice_number)
);

-- ============================================================
-- TABLE: invoice_lines
-- Weekly billing rows per invoice.
-- ============================================================
CREATE TABLE invoice_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Week range (Sun → Sat)
    period_from     DATE NOT NULL,
    period_to       DATE NOT NULL,

    hours           NUMERIC(8,2) NOT NULL DEFAULT 40.00,
    hourly_rate     NUMERIC(10,2) NOT NULL,
    amount          NUMERIC(12,2) GENERATED ALWAYS AS (hours * hourly_rate) STORED,

    sort_order      INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
