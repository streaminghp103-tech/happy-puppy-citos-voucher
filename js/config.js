window.CONFIG = {
  // UBAH BAGIAN INI
  supabaseUrl: "https://ychumnhibhmteymcfpij.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljaHVtbmhpYmhtdGV5bWNmcGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDU4NzksImV4cCI6MjEwNDAyMTg3OX0._aPVWHZjmxt85e2QrzP1z7z7epbdiF7BDXZP1pbULdY",
  whatsappNumber: "6285348773757",
  voucherPrefix: "HP103-FR",
  expiryMode: "days",
  expiryDays: 30,
  fixedExpiryDate: "",
  metaPixelId: "",
  campaignName: "happy-puppy-citos-free-room",
  whatsappMessageTemplate: "Halo Happy Puppy Citos\n\nSaya sudah claim Voucher GRATIS KARAOKE 1 JAM\n\nNama: {nama}\nKode Voucher: {kode}\nTanggal Claim: {tanggal_claim}\nBerlaku Sampai: {tanggal_expired}\n\nSaya akan melampirkan foto voucher yang baru saja tersimpan di HP saya.\n\nSaya ingin menggunakan voucher ini untuk karaoke di Happy Puppy Citos.",

  // Biasanya tidak perlu diubah
  timezone: "Asia/Makassar",
  templatePath: "assets/voucher-template.png",
  adminPageSize: 1000
};

window.VOUCHER_STYLE = {
  code: {
    x: 0.29,
    y: 0.67,
    fontSize: 48,
    fontFamily: "Arial",
    fontWeight: "bold",
    color: "#000000",
    align: "center"
  },
  claimDate: {
    x: 0.79,
    y: 0.595,
    fontSize: 28,
    fontFamily: "Arial",
    fontWeight: "bold",
    color: "#000000",
    align: "center"
  },
  expiryDate: {
    x: 0.79,
    y: 0.717,
    fontSize: 28,
    fontFamily: "Arial",
    fontWeight: "bold",
    color: "#000000",
    align: "center"
  }
};
