-- ============================================================
-- 003_functions_triggers.sql
-- Auto-updated timestamps, invoice numbering, totals sync.
-- Run AFTER 002_rls_policies.sql
-- ============================================================

-- ── UPDATED_AT TRIGGER ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── AUTO-CREATE SETTINGS ROW ON SIGNUP ───────────────────
-- When a new user signs up via Google OAuth, create their
-- settings row automatically with a fresh share token.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO settings (user_id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── INVOICE NUMBER GENERATOR ──────────────────────────────
-- Called from the frontend before inserting a new invoice.
-- Returns next invoice number for a given user and year.
-- e.g. INV-2026001, INV-2026002, ...
CREATE OR REPLACE FUNCTION get_next_invoice_number(
    p_user_id   UUID,
    p_year      INTEGER,
    p_prefix    TEXT DEFAULT 'INV-'
)
RETURNS TABLE (
    invoice_number  TEXT,
    sequence_number INTEGER
) AS $$
DECLARE
    v_last_seq  INTEGER;
    v_next_seq  INTEGER;
    v_prefix    TEXT;
BEGIN
    -- Get the highest sequence for this user in this year
    SELECT COALESCE(MAX(sequence_number), 0)
    INTO v_last_seq
    FROM invoices
    WHERE user_id = p_user_id
    AND invoice_year = p_year;

    v_next_seq := v_last_seq + 1;

    -- Format: PREFIX-YYYY + 3-digit zero-padded sequence
    -- e.g. INV-2026001
    RETURN QUERY SELECT
        p_prefix || p_year::TEXT || LPAD(v_next_seq::TEXT, 3, '0'),
        v_next_seq;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── INVOICE TOTALS SYNC ───────────────────────────────────
-- Recalculates invoice subtotal, hst_amount, total, total_hours
-- whenever a line is inserted, updated, or deleted.
CREATE OR REPLACE FUNCTION sync_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_hst_rate   NUMERIC(5,2);
BEGIN
    -- Determine which invoice to update
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;

    -- Get the invoice's HST rate
    SELECT hst_rate INTO v_hst_rate
    FROM invoices WHERE id = v_invoice_id;

    -- Recompute and update
    UPDATE invoices SET
        total_hours = (
            SELECT COALESCE(SUM(hours), 0)
            FROM invoice_lines
            WHERE invoice_id = v_invoice_id
        ),
        subtotal = (
            SELECT COALESCE(SUM(amount), 0)
            FROM invoice_lines
            WHERE invoice_id = v_invoice_id
        ),
        hst_amount = (
            SELECT COALESCE(SUM(amount), 0) * v_hst_rate / 100
            FROM invoice_lines
            WHERE invoice_id = v_invoice_id
        ),
        total = (
            SELECT COALESCE(SUM(amount), 0) * (1 + v_hst_rate / 100)
            FROM invoice_lines
            WHERE invoice_id = v_invoice_id
        ),
        updated_at = NOW()
    WHERE id = v_invoice_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_lines_sync_totals
    AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
    FOR EACH ROW EXECUTE FUNCTION sync_invoice_totals();

-- ── PUBLIC SHARE LOOKUP ───────────────────────────────────
-- Looks up a user_id from a share token.
-- Used by the public share page to fetch the right data.
CREATE OR REPLACE FUNCTION get_user_by_share_token(p_token UUID)
RETURNS TABLE (
    user_id         UUID,
    shared_pages    TEXT[],
    sharing_enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.user_id, s.shared_pages, s.sharing_enabled
    FROM settings s
    WHERE s.share_token = p_token
    AND s.sharing_enabled = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
