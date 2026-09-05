(function () {
  let claims = [];
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

  function filteredClaims() {
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

  function getTodayWita() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: window.CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function updateMetrics() {
    const today = getTodayWita();
    const uniqueNumbers = new Set(claims.map((row) => row.whatsapp));
    const repeatNumbers = new Set(
      claims
        .map((row) => row.whatsapp)
        .filter((number, index, list) => list.indexOf(number) !== index)
    );

    document.getElementById("totalClaims").textContent = claims.length;
    document.getElementById("todayClaims").textContent = claims.filter((row) => row.claim_day === today).length;
    document.getElementById("uniqueCustomers").textContent = uniqueNumbers.size;
    document.getElementById("repeatCustomers").textContent = repeatNumbers.size;
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
      : `<tr><td colspan="6" class="empty-row">Belum ada data yang cocok.</td></tr>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function loadClaims() {
    clearMessage(adminError);
    let query = client
      .from("voucher_claims")
      .select("customer_name, whatsapp, voucher_code, claim_day, expires_at, utm_source, utm_medium, utm_campaign, utm_content, created_at")
      .order("created_at", { ascending: false });

    if (startDateFilter.value) {
      query = query.gte("claim_day", startDateFilter.value);
    }

    if (endDateFilter.value) {
      query = query.lte("claim_day", endDateFilter.value);
    }

    const { data, error } = await query.limit(window.CONFIG.adminPageSize || 1000);

    if (error) throw error;
    claims = data || [];
    updateMetrics();
    renderTable();
  }

  async function loadSettings() {
    settingWhatsapp.value = window.CONFIG.whatsappNumber || "";
    settingTemplatePath.value = window.CONFIG.templatePath || "assets/voucher-template.png";

    try {
      const settings = await window.HPVoucherSupabase.loadCampaignSettings();
      Object.assign(window.CONFIG, settings);
      settingWhatsapp.value = window.CONFIG.whatsappNumber || "";
      settingTemplatePath.value = window.CONFIG.templatePath || "assets/voucher-template.png";
      clearMessage(settingsMessage);
    } catch (error) {
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

    const periodText = startDateFilter.value || endDateFilter.value
      ? `${startDateFilter.value || "awal"} sampai ${endDateFilter.value || "akhir"}`
      : "Semua data";
    const tableRows = [headers, ...rows]
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
          </style>
        </head>
        <body>
          <h2>Voucher Happy Puppy Citos</h2>
          <p>Periode: ${escapeHtml(periodText)}</p>
          <table>${tableRows}</table>
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
    const templatePath = settingTemplatePath.value.trim();

    if (!window.HPVoucherSupabase.isValidIndonesianWhatsApp(whatsappNumber)) {
      setMessage(settingsMessage, "Nomor WhatsApp belum valid. Contoh: 6285348773757.");
      settingsMessage.classList.add("error");
      return;
    }

    if (!templatePath) {
      setMessage(settingsMessage, "Gambar voucher wajib diisi.");
      settingsMessage.classList.add("error");
      return;
    }

    saveSettingsButton.disabled = true;
    try {
      await window.HPVoucherSupabase.saveCampaignSettings({
        whatsappNumber,
        templatePath
      });
      window.CONFIG.whatsappNumber = whatsappNumber;
      window.CONFIG.templatePath = templatePath;
      settingWhatsapp.value = whatsappNumber;
      settingsMessage.classList.remove("error");
      setMessage(settingsMessage, "Pengaturan berhasil disimpan.");
    } catch (error) {
      settingsMessage.classList.add("error");
      setMessage(settingsMessage, error.message || "Pengaturan gagal disimpan.");
    } finally {
      saveSettingsButton.disabled = false;
    }
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
