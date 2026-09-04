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
  const dateFilter = document.getElementById("dateFilter");

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
    const selectedDate = dateFilter.value;
    return claims.filter((row) => {
      const matchesDate = !selectedDate || row.claim_day === selectedDate;
      const haystack = `${row.customer_name} ${row.whatsapp} ${row.voucher_code}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesDate && matchesQuery;
    });
  }

  function updateMetrics() {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: window.CONFIG.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
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
    const { data, error } = await client
      .from("voucher_claims")
      .select("customer_name, whatsapp, voucher_code, claim_day, expires_at, utm_source, utm_medium, utm_campaign, utm_content, created_at")
      .order("created_at", { ascending: false })
      .limit(window.CONFIG.adminPageSize || 1000);

    if (error) throw error;
    claims = data || [];
    updateMetrics();
    renderTable();
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

  document.getElementById("exportButton").addEventListener("click", () => {
    const headers = ["Nama", "WhatsApp", "Kode Voucher", "Tanggal Claim", "Expired", "Campaign"];
    const rows = filteredClaims().map((row) => [
      row.customer_name,
      row.whatsapp,
      row.voucher_code,
      row.claim_day,
      row.expires_at,
      campaignLabel(row)
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "voucher-happy-puppy-citos.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  searchInput.addEventListener("input", renderTable);
  dateFilter.addEventListener("change", renderTable);
  checkSession();
})();
