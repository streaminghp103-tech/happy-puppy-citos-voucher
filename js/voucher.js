(function () {
  const MONTHS_ID = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
  ];

  function parseDateOnly(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function formatDateIndonesia(value) {
    const date = value instanceof Date ? value : parseDateOnly(value);
    return `${date.getUTCDate()} ${MONTHS_ID[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }

  function calculateExpiryDate(claimDay) {
    if (window.CONFIG.expiryMode === "fixed_date" && window.CONFIG.fixedExpiryDate) {
      return window.CONFIG.fixedExpiryDate;
    }
    const date = parseDateOnly(claimDay);
    date.setUTCDate(date.getUTCDate() + Number(window.CONFIG.expiryDays || 30));
    return date.toISOString().slice(0, 10);
  }

  function loadTemplate() {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Template voucher gagal dimuat. Pastikan assets/voucher-template.png sudah ada."));
      image.src = window.CONFIG.templatePath;
    });
  }

  function resolvePoint(style, width, height) {
    return {
      x: style.x > 0 && style.x <= 1 ? style.x * width : style.x,
      y: style.y > 0 && style.y <= 1 ? style.y * height : style.y
    };
  }

  function drawText(ctx, text, style, width, height) {
    const point = resolvePoint(style, width, height);
    const fontWeight = style.fontWeight ? `${style.fontWeight} ` : "";
    ctx.save();
    ctx.font = `${fontWeight}${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textAlign = style.align || "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, point.x, point.y);
    ctx.restore();
  }

  async function renderVoucher(canvas, claim) {
    const template = await loadTemplate();
    const ctx = canvas.getContext("2d");
    canvas.width = template.naturalWidth || template.width;
    canvas.height = template.naturalHeight || template.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

    const claimDate = claim.claim_day || claim.claimDate;
    const expiryDate = claim.expires_at || claim.expiryDate || calculateExpiryDate(claimDate);

    drawText(ctx, claim.voucher_code || claim.voucherCode, window.VOUCHER_STYLE.code, canvas.width, canvas.height);
    drawText(ctx, formatDateIndonesia(claimDate), window.VOUCHER_STYLE.claimDate, canvas.width, canvas.height);
    drawText(ctx, formatDateIndonesia(expiryDate), window.VOUCHER_STYLE.expiryDate, canvas.width, canvas.height);

    return {
      claimDate,
      expiryDate,
      formattedClaimDate: formatDateIndonesia(claimDate),
      formattedExpiryDate: formatDateIndonesia(expiryDate)
    };
  }

  function downloadCanvas(canvas, voucherCode) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Browser gagal membuat file PNG."));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `Voucher-HappyPuppy-Citos-${voucherCode}.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          resolve();
        }, "image/png");
      } catch (error) {
        reject(error);
      }
    });
  }

  window.HPVoucherCanvas = {
    calculateExpiryDate,
    formatDateIndonesia,
    renderVoucher,
    downloadCanvas
  };
})();
