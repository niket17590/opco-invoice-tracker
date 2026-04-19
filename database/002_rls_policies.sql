-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security — users can only see their own data.
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── SETTINGS ──────────────────────────────────────────────
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings: owner full access"
    ON settings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Public read via share token (no auth required)
CREATE POLICY "settings: public share read"
    ON settings FOR SELECT
    USING (sharing_enabled = TRUE);

-- ── CLIENTS ───────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients: owner full access"
    ON clients FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Public read: allowed if the owner has sharing enabled
CREATE POLICY "clients: public share read"
    ON clients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM settings s
            WHERE s.user_id = clients.user_id
            AND s.sharing_enabled = TRUE
        )
    );

-- ── INVOICES ──────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices: owner full access"
    ON invoices FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoices: public share read"
    ON invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM settings s
            WHERE s.user_id = invoices.user_id
            AND s.sharing_enabled = TRUE
            AND 'invoices' = ANY(s.shared_pages)
        )
    );

-- ── INVOICE LINES ─────────────────────────────────────────
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines: owner full access"
    ON invoice_lines FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoice_lines: public share read"
    ON invoice_lines FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM invoices inv
            JOIN settings s ON s.user_id = inv.user_id
            WHERE inv.id = invoice_lines.invoice_id
            AND s.sharing_enabled = TRUE
            AND 'invoices' = ANY(s.shared_pages)
        )
    );
