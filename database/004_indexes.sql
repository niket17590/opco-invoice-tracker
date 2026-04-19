-- ============================================================
-- 004_indexes.sql
-- Performance indexes.
-- Run AFTER 003_functions_triggers.sql
-- ============================================================

-- Settings lookup by share token (public share page)
CREATE INDEX idx_settings_share_token
    ON settings (share_token)
    WHERE sharing_enabled = TRUE;

-- Clients by user
CREATE INDEX idx_clients_user_id
    ON clients (user_id)
    WHERE is_active = TRUE;

-- Invoices by user, sorted by date descending (invoice list page)
CREATE INDEX idx_invoices_user_date
    ON invoices (user_id, invoice_date DESC);

-- Invoices by year (for invoice number generation)
CREATE INDEX idx_invoices_user_year
    ON invoices (user_id, invoice_year);

-- Invoice lines by invoice
CREATE INDEX idx_invoice_lines_invoice
    ON invoice_lines (invoice_id, sort_order);
