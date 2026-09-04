(function () {
  function hasSupabaseConfig() {
    return Boolean(
      window.CONFIG &&
      window.CONFIG.supabaseUrl &&
      window.CONFIG.supabaseAnonKey &&
      !window.CONFIG.supabaseUrl.includes("YOUR_") &&
      !window.CONFIG.supabaseAnonKey.includes("YOUR_")
    );
  }

  function createClient() {
    if (!hasSupabaseConfig()) {
      return null;
    }
    return window.supabase.createClient(window.CONFIG.supabaseUrl, window.CONFIG.supabaseAnonKey);
  }

  function normalizeWhatsApp(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("0")) return "62" + digits.slice(1);
    if (digits.startsWith("62")) return digits;
    if (digits.startsWith("8")) return "62" + digits;
    return digits;
  }

  function isValidIndonesianWhatsApp(raw) {
    const normalized = normalizeWhatsApp(raw);
    return /^628[1-9][0-9]{7,11}$/.test(normalized);
  }

  async function claimVoucher(payload) {
    const client = createClient();
    if (!client) {
      throw new Error("Konfigurasi Supabase belum diisi di js/config.js.");
    }

    const { data, error } = await client.rpc("claim_voucher", {
      p_customer_name: payload.customerName,
      p_whatsapp: payload.whatsapp,
      p_voucher_prefix: window.CONFIG.voucherPrefix,
      p_expiry_mode: window.CONFIG.expiryMode,
      p_expiry_days: window.CONFIG.expiryDays,
      p_fixed_expiry_date: window.CONFIG.fixedExpiryDate || null,
      p_utm_source: payload.utmSource || null,
      p_utm_medium: payload.utmMedium || null,
      p_utm_campaign: payload.utmCampaign || window.CONFIG.campaignName,
      p_utm_content: payload.utmContent || null
    });

    if (error) throw error;
    if (!data) throw new Error("Supabase tidak mengembalikan data voucher.");
    return Array.isArray(data) ? data[0] : data;
  }

  window.HPVoucherSupabase = {
    createClient,
    hasSupabaseConfig,
    normalizeWhatsApp,
    isValidIndonesianWhatsApp,
    claimVoucher
  };
})();
