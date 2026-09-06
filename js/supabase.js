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

  async function recordPageVisit(payload) {
    const client = createClient();
    if (!client) return null;

    const { data, error } = await client.rpc("record_page_visit", {
      p_visitor_id: payload.visitorId,
      p_page_path: payload.pagePath,
      p_utm_source: payload.utmSource || null,
      p_utm_medium: payload.utmMedium || null,
      p_utm_campaign: payload.utmCampaign || window.CONFIG.campaignName,
      p_utm_content: payload.utmContent || null
    });

    if (error) {
      console.warn("Kunjungan halaman belum bisa dicatat:", error.message);
      return null;
    }
    return data;
  }

  async function markPageVisitClaimed(payload) {
    const client = createClient();
    if (!client) return;

    const { error } = await client.rpc("mark_page_visit_claimed", {
      p_visitor_id: payload.visitorId,
      p_claim_id: payload.claimId || null
    });

    if (error) {
      console.warn("Status kunjungan belum bisa diperbarui:", error.message);
    }
  }

  async function loadCampaignSettings() {
    const client = createClient();
    if (!client) return {};

    const { data, error } = await client
      .from("campaign_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["whatsappNumber", "templatePath", "whatsappMessageTemplate"]);

    if (error) {
      console.warn("Pengaturan campaign belum tersedia:", error.message);
      return {};
    }

    return (data || []).reduce((settings, row) => {
      settings[row.setting_key] = row.setting_value;
      return settings;
    }, {});
  }

  async function saveCampaignSettings(settings) {
    const client = createClient();
    if (!client) {
      throw new Error("Konfigurasi Supabase belum diisi di js/config.js.");
    }

    const rows = Object.entries(settings)
      .filter(([, value]) => String(value || "").trim())
      .map(([setting_key, setting_value]) => ({
        setting_key,
        setting_value: String(setting_value).trim()
      }));

    const { error } = await client
      .from("campaign_settings")
      .upsert(rows, { onConflict: "setting_key" });

    if (error) throw error;
  }

  async function uploadVoucherTemplate(file) {
    const client = createClient();
    if (!client) {
      throw new Error("Konfigurasi Supabase belum diisi di js/config.js.");
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Format gambar harus PNG, JPG, atau WEBP.");
    }

    const maxSize = 8 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error("Ukuran gambar maksimal 8 MB.");
    }

    const extension = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const fileName = `voucher-template-${Date.now()}.${extension || "png"}`;
    const filePath = `campaign/${fileName}`;
    const { error: uploadError } = await client.storage
      .from("voucher-assets")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data } = client.storage
      .from("voucher-assets")
      .getPublicUrl(filePath);

    if (!data.publicUrl) {
      throw new Error("URL gambar hasil upload belum tersedia.");
    }

    return data.publicUrl;
  }

  window.HPVoucherSupabase = {
    createClient,
    hasSupabaseConfig,
    normalizeWhatsApp,
    isValidIndonesianWhatsApp,
    claimVoucher,
    recordPageVisit,
    markPageVisitClaimed,
    loadCampaignSettings,
    saveCampaignSettings,
    uploadVoucherTemplate
  };
})();
