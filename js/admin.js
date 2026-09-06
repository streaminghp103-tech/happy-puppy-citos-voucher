(function () {
  let claims = [];
  let visits = [];
  let client = null;

  const loginPanel = document.getElementById("loginPanel");
  const dashboardPanel = document.getElementById("dashboardPanel");
  const loginForm = document.getElementById("loginForm");
  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const loginError = document.getElementById("loginError");
  const adminError = document.getElementById("adminError");
  const tableBody = document.getElementById("claimsTableBody");
  const searchInput = document.getElementById("searchInput");
  const startDateFilter = document.getElementById("startDateFilter");
  const endDateFilter = document.getElementById("endDateFilter");
  const settingsForm = document.getElementById("settingsForm");
  const settingWhatsapp = document.getElementById("settingWhatsapp");
  const settingTemplatePath = document.getElementById("settingTemplatePath");
  const settingTemplateFile = document.getElementById("settingTemplateFile");
  const templatePreview = document.getElementById("templatePreview");
  const saveSettingsButton = document.getElementById("saveSettingsButton");
  const settingsMessage = document.getElementById("settingsMessage");

  function show(element) {
    element.classList.remove("hidden");
  }

  function hide(element) {
    element.classList.add("hidden");
  }

  function setMessage(element, message) {
    element.textContent = message;
    show(element);
  }

  function clearMessage(element) {
    element.textContent = "";
    element.classList.remove("error");
    hide(element);
  }

  function requireConfig() {
    if (!window.HPVoucherSupabase.hasSupabaseConfig()) {
      throw new Error("Isi Supabase URL dan anon key di js/config.js terlebih dahulu.");
    }
  }

  function campaignLabel(row) {
    return [row.utm_source, row.utm_medium, row.utm_campaign, row.utm_content]
      .filter(Boolean)
      .join(" / ");
  }

  function customerClaimSummary() {
    const grouped = new Map();
    filteredClaims().forEach((row) => {
      const key = row.whatsapp || row.customer_name;
      const existing = grouped.get(key) || {
        customer_name: row.customer_name,
        whatsapp: row.whatsapp,
        count: 0,
        firstClaim: row.claim_day,
        lastClaim: row.claim_day,
        voucherCodes: []
      };

      existing.count += 1;
      existing.firstClaim = row.claim_day < existing.firstClaim ? row.claim_day : existing.firstClaim;
      existing.lastClaim = row.claim_day > existing.lastClaim ? row.claim_day : existing.lastClaim;
      existing.voucherCodes.push(row.voucher_code);
      grouped.set(key, existing);
    });

    return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.customer_name.localeCompare(b.customer_name));
  }

  function filteredClaims() {
    if (!hasDateFilter()) return [];
    const query = searchInput.value.trim().toLowerCase();
    const startDate = startDateFilter.value;
    const endDate = endDateFilter.value;
    return claims.filter((row) => {
      const matchesStart = !startDate || row.claim_day >= startDate;
      const matchesEnd = !endDate || row.claim_day <= endDate;
      const haystack = `${row.customer_name} ${row.whatsapp} ${row.voucher_code}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesStart && matchesEnd && matchesQuery;
    });
  }

  function hasDateFilter() {
    return Boolean(startDateFilter.value || endDateFilter.value);
  }

  function getTodayWita() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: window.CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function getMetrics() {
    const today = getTodayWita();
    const uniqueNumbers = new Set(claims.map((row) => row.whatsapp));
    const repeatNumbers = new Set(
      claims
        .map((row) => row.whatsapp)
        .filter((number, index, list) => list.indexOf(number) !== index)
    );
    const totalVisitors = visits.length;
    const totalClaims = claims.length;
    const claimedVisitors = visits.filter((row) => row.claimed_at).length;
    const unclaimedVisitors = visits.filter((row) => !row.claimed_at).length;
    const conversionRate = totalVisitors ? Math.round((claimedVisitors / totalVisitors) * 1000) / 10 : 0;

    return {
      totalVisitors,
      totalClaims,
      claimedVisitors,
      todayClaims: claims.filter((row) => row.claim_day === today).length,
      uniqueCustomers: uniqueNumbers.size,
      repeatCustomers: repeatNumbers.size,
      unclaimedVisitors,
      conversionRate
    };
  }

  function updateMetrics() {
    const metrics = getMetrics();

    document.getElementById("totalClaims").textContent = metrics.totalClaims;
    document.getElementById("todayClaims").textContent = metrics.todayClaims;
    document.getElementById("uniqueCustomers").textContent = metrics.uniqueCustomers;
    document.getElementById("repeatCustomers").textContent = metrics.repeatCustomers;
    document.getElementById("unclaimedVisitors").textContent = metrics.unclaimedVisitors;
    document.getElementById("conversionRate").textContent = `${metrics.conversionRate}%`;
  }

  function renderTable() {
    const rows = filteredClaims();
    tableBody.innerHTML = rows.length
      ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.customer_name)}</td>
          <td>${escapeHtml(row.whatsapp)}</td>
          <td><strong>${escapeHtml(row.voucher_code)}</strong></td>
          <td>${escapeHtml(window.HPVoucherCanvas.formatDateIndonesia(row.claim_day))}</td>
          <td>${escapeHtml(window.HPVoucherCanvas.formatDateIndonesia(row.expires_at))}</td>
          <td>${escapeHtml(campaignLabel(row) || "-")}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="6" class="empty-row">${hasDateFilter() ? "Belum ada data yang cocok." : "Pilih tanggal Dari atau Sampai untuk menampilkan data."}</td></tr>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: window.CONFIG.timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  async function loadClaims() {
    clearMessage(adminError);
    if (!hasDateFilter()) {
      claims = [];
      visits = [];
      updateMetrics();
      renderTable();
      return;
    }

    let claimsQuery = client
      .from("voucher_claims")
      .select("customer_name, whatsapp, voucher_code, claim_day, expires_at, utm_source, utm_medium, utm_campaign, utm_content, created_at")
      .order("created_at", { ascending: false });
    let visitsQuery = client
      .from("page_visits")
      .select("visitor_id, visit_day, page_path, claimed_at, utm_source, utm_medium, utm_campaign, utm_content, created_at, last_seen_at")
      .order("created_at", { ascending: false });

    if (startDateFilter.value) {
      claimsQuery = claimsQuery.gte("claim_day", startDateFilter.value);
      visitsQuery = visitsQuery.gte("visit_day", startDateFilter.value);
    }

    if (endDateFilter.value) {
      claimsQuery = claimsQuery.lte("claim_day", endDateFilter.value);
      visitsQuery = visitsQuery.lte("visit_day", endDateFilter.value);
    }

    const [{ data: claimData, error: claimError }, { data: visitData, error: visitError }] = await Promise.all([
      claimsQuery.limit(window.CONFIG.adminPageSize || 1000),
      visitsQuery.limit(window.CONFIG.adminPageSize || 1000)
    ]);

    if (claimError) throw claimError;
    claims = claimData || [];
    visits = visitError ? [] : (visitData || []);
    if (visitError) {
      console.warn("Data kunjungan halaman belum bisa dimuat:", visitError.message);
    }
    updateMetrics();
    renderTable();
  }

  async function loadSettings() {
    settingWhatsapp.value = window.CONFIG.whatsappNumber || "";
    settingTemplatePath.value = window.CONFIG.templatePath || "assets/voucher-template.png";
    templatePreview.src = settingTemplatePath.value;

    try {
      const settings = await window.HPVoucherSupabase.loadCampaignSettings();
      Object.assign(window.CONFIG, settings);
      settingWhatsapp.value = window.CONFIG.whatsappNumber || "";
      settingTemplatePath.value = window.CONFIG.templatePath || "assets/voucher-template.png";
      templatePreview.src = settingTemplatePath.value;
      clearMessage(settingsMessage);
    } catch (error) {
      settingsMessage.classList.add("error");
      setMessage(settingsMessage, error.message || "Pengaturan belum bisa dimuat.");
    }
  }

  async function checkSession() {
    try {
      requireConfig();
      client = window.HPVoucherSupabase.createClient();
      const { data } = await client.auth.getSession();
      if (data.session) {
        hide(loginPanel);
        show(dashboardPanel);
        show(logoutButton);
        await loadSettings();
        await loadClaims();
      }
    } catch (error) {
      setMessage(loginError, error.message);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(loginError);
    loginButton.disabled = true;
    try {
      requireConfig();
      client = window.HPVoucherSupabase.createClient();
      const email = document.getElementById("adminEmail").value.trim();
      const password = document.getElementById("adminPassword").value;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      hide(loginPanel);
      show(dashboardPanel);
      show(logoutButton);
      await loadSettings();
      await loadClaims();
    } catch (error) {
      setMessage(loginError, error.message || "Login gagal.");
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (client) await client.auth.signOut();
    show(loginPanel);
    hide(dashboardPanel);
    hide(logoutButton);
  });

  document.getElementById("refreshButton").addEventListener("click", async () => {
    try {
      await loadClaims();
    } catch (error) {
      setMessage(adminError, error.message);
    }
  });

  document.getElementById("resetFilterButton").addEventListener("click", async () => {
    searchInput.value = "";
    startDateFilter.value = "";
    endDateFilter.value = "";
    renderTable();
    try {
      await loadClaims();
    } catch (error) {
      setMessage(adminError, error.message);
    }
  });

  document.getElementById("exportButton").addEventListener("click", () => {
    const headers = ["Nama", "WhatsApp", "Kode Voucher", "Tanggal Claim", "Expired", "Campaign"];
    const rows = filteredClaims().map((row) => [
      row.customer_name,
      row.whatsapp,
      row.voucher_code,
      window.HPVoucherCanvas.formatDateIndonesia(row.claim_day),
      window.HPVoucherCanvas.formatDateIndonesia(row.expires_at),
      campaignLabel(row)
    ]);
    const metrics = getMetrics();
    const customerSummaryHeaders = ["Nama", "WhatsApp", "Jumlah Claim", "Claim Pertama", "Claim Terakhir", "Kode Voucher"];
    const customerSummaryRows = customerClaimSummary().map((row) => [
      row.customer_name,
      row.whatsapp,
      row.count,
      window.HPVoucherCanvas.formatDateIndonesia(row.firstClaim),
      window.HPVoucherCanvas.formatDateIndonesia(row.lastClaim),
      row.voucherCodes.join(", ")
    ]);
    const unclaimedVisitHeaders = ["Visitor ID", "Tanggal Masuk", "Halaman", "Campaign", "Pertama Masuk", "Terakhir Terlihat"];
    const unclaimedVisitRows = visits
      .filter((row) => !row.claimed_at)
      .map((row) => [
        row.visitor_id,
        window.HPVoucherCanvas.formatDateIndonesia(row.visit_day),
        row.page_path || "-",
        campaignLabel(row) || "-",
        formatDateTime(row.created_at),
        formatDateTime(row.last_seen_at)
      ]);

    const periodText = startDateFilter.value || endDateFilter.value
      ? `${startDateFilter.value || "awal"} sampai ${endDateFilter.value || "akhir"}`
      : "Semua data";
    const summaryRows = [
      ["Periode", periodText],
      ["Total pengunjung masuk", metrics.totalVisitors],
      ["Pengunjung yang claim", metrics.claimedVisitors],
      ["Total claim voucher", metrics.totalClaims],
      ["Masuk belum claim", metrics.unclaimedVisitors],
      ["Conversion rate", `${metrics.conversionRate}%`],
      ["Unique customer", metrics.uniqueCustomers],
      ["Repeat customer", metrics.repeatCustomers]
    ];
    const summaryTableRows = summaryRows
      .map((row) => `<tr><th>${escapeHtml(row[0])}</th><td>${escapeHtml(row[1])}</td></tr>`)
      .join("");
    const tableRows = [headers, ...rows]
      .map((row, index) => {
        const tag = index === 0 ? "th" : "td";
        return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`;
      })
      .join("");
    const customerSummaryTableRows = [customerSummaryHeaders, ...customerSummaryRows]
      .map((row, index) => {
        const tag = index === 0 ? "th" : "td";
        return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`;
      })
      .join("");
    const unclaimedTableRows = [unclaimedVisitHeaders, ...unclaimedVisitRows]
      .map((row, index) => {
        const tag = index === 0 ? "th" : "td";
        return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`;
      })
      .join("");
    const excelHtml = `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; }
            th { background: #f4b63f; color: #1c1a17; font-weight: bold; }
            th, td { border: 1px solid #333333; padding: 8px 10px; mso-number-format: "\\@"; }
            h2, p { font-family: Arial, sans-serif; }
            .summary th { text-align: left; width: 220px; }
          </style>
        </head>
        <body>
          <h2>Voucher Happy Puppy Citos</h2>
          <p>Periode: ${escapeHtml(periodText)}</p>
          <table class="summary">${summaryTableRows}</table>
          <br>
          <h2>Data Claim Voucher</h2>
          <table>${tableRows}</table>
          <br>
          <h2>Jumlah Claim per Customer</h2>
          <table>${customerSummaryTableRows}</table>
          <br>
          <h2>Pengunjung Masuk Belum Claim</h2>
          <table>${unclaimedTableRows}</table>
        </body>
      </html>
    `;
    const blob = new Blob(["\ufeff", excelHtml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "voucher-happy-puppy-citos.xls";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(settingsMessage);

    const whatsappNumber = window.HPVoucherSupabase.normalizeWhatsApp(settingWhatsapp.value);
    const selectedFile = settingTemplateFile.files[0];
    let templatePath = settingTemplatePath.value.trim();

    if (!window.HPVoucherSupabase.isValidIndonesianWhatsApp(whatsappNumber)) {
      setMessage(settingsMessage, "Nomor WhatsApp belum valid. Contoh: 6285348773757.");
      settingsMessage.classList.add("error");
      return;
    }

    if (!selectedFile && !templatePath) {
      setMessage(settingsMessage, "Gambar voucher wajib diisi.");
      settingsMessage.classList.add("error");
      return;
    }

    saveSettingsButton.disabled = true;
    try {
      if (selectedFile) {
        saveSettingsButton.textContent = "Mengupload...";
        templatePath = await window.HPVoucherSupabase.uploadVoucherTemplate(selectedFile);
      }
      saveSettingsButton.textContent = "Menyimpan...";
      await window.HPVoucherSupabase.saveCampaignSettings({
        whatsappNumber,
        templatePath
      });
      window.CONFIG.whatsappNumber = whatsappNumber;
      window.CONFIG.templatePath = templatePath;
      settingWhatsapp.value = whatsappNumber;
      settingTemplatePath.value = templatePath;
      settingTemplateFile.value = "";
      templatePreview.src = templatePath;
      settingsMessage.classList.remove("error");
      setMessage(settingsMessage, "Pengaturan berhasil disimpan.");
    } catch (error) {
      settingsMessage.classList.add("error");
      setMessage(settingsMessage, error.message || "Pengaturan gagal disimpan.");
    } finally {
      saveSettingsButton.disabled = false;
      saveSettingsButton.textContent = "Simpan Pengaturan";
    }
  });

  settingTemplateFile.addEventListener("change", () => {
    const selectedFile = settingTemplateFile.files[0];
    if (!selectedFile) {
      templatePreview.src = settingTemplatePath.value || "assets/voucher-template.png";
      return;
    }

    templatePreview.src = URL.createObjectURL(selectedFile);
  });

  searchInput.addEventListener("input", renderTable);
  startDateFilter.addEventListener("change", async () => {
    try {
      await loadClaims();
    } catch (error) {
      setMessage(adminError, error.message);
    }
  });
  endDateFilter.addEventListener("change", async () => {
    try {
      await loadClaims();
    } catch (error) {
      setMessage(adminError, error.message);
    }
  });
  checkSession();
})();
