(function () {
  const state = {
    isSubmitting: false,
    currentClaim: null,
    canvasReady: false,
    visitorId: ""
  };

  const form = document.getElementById("claimForm");
  const claimButton = document.getElementById("claimButton");
  const loadingState = document.getElementById("loadingState");
  const errorState = document.getElementById("errorState");
  const resultPanel = document.getElementById("resultPanel");
  const resultTitle = document.getElementById("resultTitle");
  const resultMessage = document.getElementById("resultMessage");
  const closeResultButton = document.getElementById("closeResultButton");
  const voucherCanvas = document.getElementById("voucherCanvas");
  const voucherFallback = document.getElementById("voucherFallback");
  const fallbackCode = document.getElementById("fallbackCode");
  const fallbackClaimDate = document.getElementById("fallbackClaimDate");
  const fallbackExpiryDate = document.getElementById("fallbackExpiryDate");
  const saveAndWhatsappButton = document.getElementById("saveAndWhatsappButton");

  function show(element) {
    element.classList.remove("hidden");
  }

  function hide(element) {
    element.classList.add("hidden");
  }

  function setError(message) {
    errorState.textContent = message;
    show(errorState);
  }

  function clearError() {
    errorState.textContent = "";
    hide(errorState);
  }

  function openResultModal() {
    show(resultPanel);
    document.body.classList.add("modal-open");
    closeResultButton.focus();
  }

  function closeResultModal() {
    hide(resultPanel);
    document.body.classList.remove("modal-open");
  }

  function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmContent: params.get("utm_content")
    };
  }

  function getVisitorId() {
    const storageKey = "hp_citos_visitor_id";
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) return existing;
      const id = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(storageKey, id);
      return id;
    } catch (error) {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function initMetaPixel() {
    const id = window.CONFIG.metaPixelId;
    if (!id) return;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', id);
    fbq('track', 'PageView');
    /* eslint-enable */
  }

  async function initCampaignSettings() {
    const settings = await window.HPVoucherSupabase.loadCampaignSettings();
    Object.assign(window.CONFIG, settings);
  }

  async function initPageVisitTracking() {
    state.visitorId = getVisitorId();
    await window.HPVoucherSupabase.recordPageVisit({
      visitorId: state.visitorId,
      pagePath: window.location.pathname,
      ...getUtmParams()
    });
  }

  function trackVoucherClaimed(claim) {
    if (window.fbq && window.CONFIG.metaPixelId) {
      window.fbq("trackCustom", "VoucherClaimed", {
        voucher_code: claim.voucher_code,
        campaign: window.CONFIG.campaignName
      });
    }
  }

  function buildWhatsAppUrl() {
    const claim = state.currentClaim;
    const name = claim.customer_name || document.getElementById("customerName").value.trim();
    const claimDate = claim.claim_day || claim.claimDate;
    const expiryDate = claim.expires_at || claim.expiryDate || window.HPVoucherCanvas.calculateExpiryDate(claimDate);
    const template = window.CONFIG.whatsappMessageTemplate || "";
    const text = template
      .replaceAll("{nama}", name)
      .replaceAll("{kode}", claim.voucher_code || "")
      .replaceAll("{tanggal_claim}", window.HPVoucherCanvas.formatDateIndonesia(claimDate))
      .replaceAll("{tanggal_expired}", window.HPVoucherCanvas.formatDateIndonesia(expiryDate));
    return `https://wa.me/${window.CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }

  function openWhatsApp() {
    if (!state.currentClaim) return;
    const url = buildWhatsAppUrl();
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  }

  async function downloadVoucher() {
    if (!state.currentClaim) return;
    if (!state.canvasReady) {
      throw new Error("Gambar voucher belum siap. Coba lagi sebentar.");
    }
    await window.HPVoucherCanvas.downloadCanvas(voucherCanvas, state.currentClaim.voucher_code);
  }

  async function showVoucher(claim) {
    state.currentClaim = claim;
    const isExisting = Boolean(claim.already_claimed);
    resultTitle.textContent = isExisting ? "Kamu sudah claim voucher hari ini" : "YEAY! VOUCHER KAMU BERHASIL DI-CLAIM";
    resultMessage.textContent = isExisting
      ? "Voucher baru bisa kamu claim lagi besok. Ini voucher yang sudah kamu punya hari ini."
      : "Voucher kamu sudah siap!";

    const expiryDate = claim.expires_at || window.HPVoucherCanvas.calculateExpiryDate(claim.claim_day);
    fallbackCode.textContent = claim.voucher_code;
    fallbackClaimDate.textContent = window.HPVoucherCanvas.formatDateIndonesia(claim.claim_day);
    fallbackExpiryDate.textContent = window.HPVoucherCanvas.formatDateIndonesia(expiryDate);
    show(voucherFallback);
    openResultModal();

    try {
      await window.HPVoucherCanvas.renderVoucher(voucherCanvas, claim);
      state.canvasReady = true;
      hide(voucherFallback);
    } catch (error) {
      state.canvasReady = false;
      setError(error.message);
    }

    trackVoucherClaimed(claim);
  }

  function setActionButtonLoading(isLoading) {
    saveAndWhatsappButton.disabled = isLoading;
    saveAndWhatsappButton.textContent = isLoading ? "MENYIMPAN VOUCHER..." : "SIMPAN VOUCHER & BUKA WHATSAPP";
  }

  function validateForm(customerName, whatsapp) {
    if (!customerName) return "Nama wajib diisi.";
    if (!whatsapp) return "Nomor WhatsApp wajib diisi.";
    if (!window.HPVoucherSupabase.isValidIndonesianWhatsApp(whatsapp)) {
      return "Nomor WhatsApp belum valid. Contoh: 081234567890.";
    }
    return "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.isSubmitting) return;
    clearError();
    closeResultModal();

    const customerName = document.getElementById("customerName").value.trim();
    const whatsapp = document.getElementById("whatsapp").value.trim();
    const validationError = validateForm(customerName, whatsapp);
    if (validationError) {
      setError(validationError);
      return;
    }

    state.isSubmitting = true;
    state.canvasReady = false;
    claimButton.disabled = true;
    show(loadingState);

    try {
      const claim = await Promise.race([
        window.HPVoucherSupabase.claimVoucher({
          customerName,
          whatsapp,
          ...getUtmParams()
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Koneksi lambat. Coba lagi sebentar.")), 20000))
      ]);
      window.HPVoucherSupabase.markPageVisitClaimed({
        visitorId: state.visitorId || getVisitorId(),
        claimId: claim.id
      });
      await showVoucher(claim);
    } catch (error) {
      setError(error.message || "Voucher belum bisa dibuat. Coba lagi sebentar.");
    } finally {
      state.isSubmitting = false;
      claimButton.disabled = false;
      hide(loadingState);
    }
  });

  saveAndWhatsappButton.addEventListener("click", async () => {
    clearError();
    setActionButtonLoading(true);
    try {
      await downloadVoucher();
      setTimeout(openWhatsApp, 400);
    } catch (error) {
      setError(error.message || "Download voucher gagal. Coba tekan tombol lagi. Kalau masih gagal, tekan lama gambar voucher lalu simpan manual.");
    } finally {
      setActionButtonLoading(false);
    }
  });

  closeResultButton.addEventListener("click", closeResultModal);
  resultPanel.addEventListener("click", (event) => {
    if (event.target === resultPanel) closeResultModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !resultPanel.classList.contains("hidden")) {
      closeResultModal();
    }
  });

  initCampaignSettings()
    .catch((error) => console.warn("Pengaturan campaign gagal dimuat:", error.message))
    .finally(() => {
      initMetaPixel();
      initPageVisitTracking();
    });
})();
