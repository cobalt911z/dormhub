    const INITIAL_DORMS = window.INITIAL_DORMS || [];


    const ZONES = [
      "ใกล้ มจพ. (อ้างอิง RentHub)",
      "ซอยวงศ์สว่าง 11",
      "ประชาราษฎร์สาย 1 (หน้า ม.)",
      "MRT วงศ์สว่าง / ถนนวงศ์สว่าง",
      "ถนนพิบูลสงคราม / บางซื่อ",
      "สะพานพระราม 7 / จรัญฯ"
    ];
    const DORM_TYPES = ["หอพักรายเดือน", "หอหญิงล้วน", "คอนโดปล่อยเช่า", "ขายสัญญาหอ / หารูมเมท", "ที่พักระยะสั้น", "บ้านเช่า/ทาวน์เฮาส์"];
    const AVAILABILITY_LABELS = {
      available: "มีห้องว่าง",
      full: "ห้องเต็ม",
      unknown: "กรุณาสอบถาม"
    };
    const STORAGE_KEY = "kmutnb_dorms_v2";
    const SITE_SETTINGS_KEY = "kmutnb_site_settings_v1";
    const ANALYTICS_CONSENT_KEY = "kmutnb_analytics_consent_v1";
    const PROMO_SEEN_KEY = "kmutnb_promo_seen_v1";
    const DEFAULT_SITE_CONFIG = window.KMUTNB_SITE_CONFIG || {};
    const SITE_THEMES = ["default", "songkran", "loy-krathong", "new-year", "mourning"];
    let editingDormId = null;
    const selectedCmsDormIds = new Set();
    let activeGalleryId = null;
    let activeGalleryImageIndex = 0;
    let galleryReturnFocus = null;
    let lightboxTouchStart = null;
    let siteSettings;
    const analyticsInitializedIds = new Set();
    let lastPageviewUrl = "";
    let previousPopupFocus = null;
    let modalReturnFocus = null;
    let promoTimer = null;

    function isValidDorm(dorm) {
      return dorm && Number.isSafeInteger(Number(dorm.id)) &&
        typeof dorm.name === "string" && dorm.name.trim() &&
        typeof dorm.zone === "string" && dorm.zone.trim() && dorm.zone.trim().length <= 120 &&
        DORM_TYPES.includes(dorm.type) &&
        Number.isFinite(Number(dorm.price)) && Number(dorm.price) >= 0 &&
        (dorm.priceMax == null || (Number.isFinite(Number(dorm.priceMax)) && Number(dorm.priceMax) >= Number(dorm.price))) &&
        (dorm.deposit == null || (Number.isFinite(Number(dorm.deposit)) && Number(dorm.deposit) >= 0)) &&
        (dorm.elecRate == null || (Number.isFinite(Number(dorm.elecRate)) && Number(dorm.elecRate) >= 0)) &&
        (dorm.waterEst == null || (Number.isFinite(Number(dorm.waterEst)) && Number(dorm.waterEst) >= 0)) &&
        Array.isArray(dorm.tags) && dorm.tags.every(tag => typeof tag === "string") &&
        Array.isArray(dorm.imageUrls || []) && (dorm.imageUrls || []).every(url => typeof url === "string") &&
        Array.isArray(dorm.photoUrls || []) && (dorm.photoUrls || []).every(url => typeof url === "string") &&
        (dorm.mapUrl == null || typeof dorm.mapUrl === "string") &&
        ["available", "full", "unknown"].includes(dorm.availability || "unknown");
    }

    function loadDorms() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(saved) && saved.every(isValidDorm)) {
          const current = saved.map(normalizeDorm);
          const missingDrafts = INITIAL_DORMS.map(dorm => normalizeDorm({ ...dorm, published: false }))
            .filter(initial => !current.some(record =>
              Number(record.id) === Number(initial.id) ||
              record.name.trim().toLowerCase() === initial.name.trim().toLowerCase()
            ));
          if (missingDrafts.length) {
            const merged = [...current, ...missingDrafts];
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch (error) {
              console.warn("New imported drafts could not be saved to local storage.", error);
            }
            return merged;
          }
          return current;
        }
      } catch (error) {
        console.warn("Saved dorm records could not be loaded; checking the previous format.", error);
      }
      const imported = INITIAL_DORMS.map(dorm => normalizeDorm({ ...dorm }));
      try {
        const previous = JSON.parse(localStorage.getItem("kmutnb_dorms_v1"));
        if (Array.isArray(previous) && previous.every(isValidDorm)) {
          for (const record of previous) {
            if (imported.some(dorm => dorm.name.toLowerCase() === record.name.toLowerCase())) continue;
            imported.push(normalizeDorm({
              ...record,
              published: false,
              desc: record.desc || "ข้อมูลเดิม รอตรวจสอบก่อนเผยแพร่"
            }));
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      } catch (error) {
        console.warn("The previous records could not be migrated to local storage.", error);
      }
      return imported;
    }

    function normalizeDorm(dorm) {
      const imageUrls = Array.isArray(dorm.imageUrls)
        ? dorm.imageUrls
        : dorm.imageUrl ? [dorm.imageUrl] : [];
      return {
        ...dorm,
        zone: String(dorm.zone || "").trim(),
        imageUrls: imageUrls.map(getImageUrl).filter(Boolean),
        photoUrls: Array.isArray(dorm.photoUrls) ? dorm.photoUrls.map(getImageUrl).filter(Boolean) : [],
        mapUrl: getImageUrl(dorm.mapUrl),
        deposit: dorm.deposit == null || dorm.deposit === "" || !Number.isFinite(Number(dorm.deposit)) || Number(dorm.deposit) < 0
          ? null : Number(dorm.deposit),
        availability: AVAILABILITY_LABELS[dorm.availability] ? dorm.availability : "unknown",
        published: dorm.published === true,
        tags: Array.isArray(dorm.tags) ? dorm.tags : []
      };
    }

    let dorms = loadDorms();

    function escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function getImageUrl(value) {
      try {
        const url = new URL(value || "");
        if (url.protocol === "https:") return url.href;
      } catch (error) {
        return "";
      }
      return "";
    }

    function saveToStorage() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dorms));
    }

    const SUPPORT_STORAGE_KEY = "kmutnb_dorm_support_url_v1";
    const DEFAULT_SUPPORT_URL = "https://www.facebook.com/groups/197822284350539";
    function getSupportUrl() {
      try {
        const url = new URL(localStorage.getItem(SUPPORT_STORAGE_KEY) || DEFAULT_SUPPORT_URL);
        return url.protocol === "https:" ? url.href : DEFAULT_SUPPORT_URL;
      } catch (error) {
        return DEFAULT_SUPPORT_URL;
      }
    }

    function secureUrl(value) {
      try {
        const url = new URL(value || "");
        return url.protocol === "https:" ? url.href : "";
      } catch (error) {
        return "";
      }
    }

    function normalizeSiteSettings(settings) {
      const popup = settings.popup && typeof settings.popup === "object" ? settings.popup : {};
      const measurementId = String(settings.gaMeasurementId || "").trim().toUpperCase();
      return {
        gaMeasurementId: /^G-[A-Z0-9]{6,}$/.test(measurementId) ? measurementId : "",
        theme: SITE_THEMES.includes(settings.theme) ? settings.theme : "default",
        popup: {
          enabled: popup.enabled === true,
          title: String(popup.title || "").slice(0, 100),
          message: String(popup.message || "").slice(0, 300),
          imageUrl: secureUrl(popup.imageUrl),
          ctaText: String(popup.ctaText || "").slice(0, 40),
          ctaUrl: secureUrl(popup.ctaUrl),
          frequency: popup.frequency === "session" ? "session" : "daily"
        }
      };
    }

    function loadSiteSettings() {
      let saved = null;
      try {
        const raw = localStorage.getItem(SITE_SETTINGS_KEY);
        if (raw) {
          saved = JSON.parse(raw);
          if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
            throw new Error("Saved site settings are not an object.");
          }
        }
      } catch (error) {
        console.warn("Saved site settings could not be loaded; using the deployed configuration.", error);
      }
      const defaults = DEFAULT_SITE_CONFIG && typeof DEFAULT_SITE_CONFIG === "object" ? DEFAULT_SITE_CONFIG : {};
      return normalizeSiteSettings({
        ...defaults,
        ...(saved || {}),
        popup: { ...(defaults.popup || {}), ...((saved && saved.popup) || {}) }
      });
    }

    function applySiteTheme() {
      document.body.classList.remove(...SITE_THEMES.map(theme => `theme-${theme}`));
      document.body.classList.add(`theme-${siteSettings.theme}`);
    }

    function getAnalyticsConsent() {
      try {
        return localStorage.getItem(ANALYTICS_CONSENT_KEY);
      } catch (error) {
        console.warn("Analytics consent could not be read from local storage.", error);
        return null;
      }
    }

    function updateAnalyticsStatus() {
      const status = document.getElementById("analyticsStatus");
      if (!status) return;
      const consent = getAnalyticsConsent();
      status.classList.toggle("draft", !siteSettings.gaMeasurementId || consent !== "accepted");
      status.textContent = !siteSettings.gaMeasurementId ? "ยังไม่ได้ตั้งค่า"
        : consent === "accepted" ? "ยินยอมแล้ว · พร้อมวัดผล"
          : consent === "rejected" ? "ผู้เข้าชมปฏิเสธการวัดผล"
            : "รอความยินยอมจากผู้เข้าชม";
      document.getElementById("analyticsPrivacyLink").hidden = !siteSettings.gaMeasurementId;
      document.getElementById("analyticsPrivacyFooter").hidden = !siteSettings.gaMeasurementId;
    }

    function initializeAnalytics() {
      const measurementId = siteSettings.gaMeasurementId;
      if (!measurementId || getAnalyticsConsent() !== "accepted") return;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      if (!analyticsInitializedIds.has(measurementId)) {
        analyticsInitializedIds.add(measurementId);
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
        script.onerror = () => console.error("Google Analytics could not be loaded.");
        document.head.appendChild(script);
        window.gtag("js", new Date());
        window.gtag("config", measurementId, { send_page_view: false });
      }
      trackPageView();
    }

    function trackEvent(eventName, parameters = {}) {
      if (getAnalyticsConsent() !== "accepted" || !siteSettings.gaMeasurementId || typeof window.gtag !== "function") return;
      window.gtag("event", eventName, { ...parameters, send_to: siteSettings.gaMeasurementId });
    }

    function trackPageView() {
      if (!siteSettings || getAnalyticsConsent() !== "accepted" || !siteSettings.gaMeasurementId) return;
      if (location.hash === "#cms" || /^#review-/.test(location.hash)) return;
      const pageLocation = `${location.origin}${location.pathname}${location.hash || "#dorm-search"}`;
      if (pageLocation === lastPageviewUrl) return;
      lastPageviewUrl = pageLocation;
      trackEvent("page_view", { page_location: pageLocation, page_title: document.title });
      const detailMatch = location.hash.match(/^#dorm-(\d+)$/);
      if (detailMatch) trackEvent("listing_detail_view", { listing_id: detailMatch[1] });
    }

    function setAnalyticsConsent(accepted) {
      if (!siteSettings.gaMeasurementId) {
        alert("กรุณาตั้งค่า Measurement ID ก่อน");
        return;
      }
      window[`ga-disable-${siteSettings.gaMeasurementId}`] = !accepted;
      try {
        localStorage.setItem(ANALYTICS_CONSENT_KEY, accepted ? "accepted" : "rejected");
      } catch (error) {
        alert("บันทึกการตั้งค่าความยินยอมไม่ได้ กรุณาเปิดใช้ local storage แล้วลองอีกครั้ง");
        console.error("Analytics consent could not be saved.", error);
        return;
      }
      document.getElementById("analyticsConsent").hidden = true;
      updateAnalyticsStatus();
      if (accepted) initializeAnalytics();
    }

    function showAnalyticsConsent() {
      if (!siteSettings.gaMeasurementId) {
        alert("กรุณาตั้งค่า Measurement ID ก่อน");
        return;
      }
      document.getElementById("analyticsConsent").hidden = false;
      document.getElementById("consentReject").focus();
    }

    function applySettingsToForm() {
      document.getElementById("gaMeasurementId").value = siteSettings.gaMeasurementId;
      document.getElementById("siteTheme").value = siteSettings.theme;
      document.getElementById("popupEnabled").checked = siteSettings.popup.enabled;
      document.getElementById("popupTitle").value = siteSettings.popup.title;
      document.getElementById("popupMessage").value = siteSettings.popup.message;
      document.getElementById("popupImageUrl").value = siteSettings.popup.imageUrl;
      document.getElementById("popupCtaText").value = siteSettings.popup.ctaText;
      document.getElementById("popupCtaUrl").value = siteSettings.popup.ctaUrl;
      document.getElementById("popupFrequency").value = siteSettings.popup.frequency;
      document.getElementById("themePreviewStatus").textContent = "ตัวอย่างธีมที่บันทึกไว้";
      document.getElementById("themePreviewStatus").dataset.state = "saved";
      document.getElementById("siteSettingsStatus").textContent = "ค่าที่บันทึกไว้ใช้กับเบราว์เซอร์นี้ · ดาวน์โหลดไฟล์ config เพื่อเผยแพร่บนเว็บ";
      document.getElementById("siteSettingsStatus").dataset.state = "saved";
      updatePopupImagePreview();
      updateAnalyticsStatus();
    }

    function markSiteSettingsUnsaved() {
      const status = document.getElementById("siteSettingsStatus");
      if (!status) return;
      status.textContent = "มีการแก้ไขที่ยังไม่บันทึก · ตัวอย่างป๊อปอัปจะแสดงค่าปัจจุบัน";
      status.dataset.state = "unsaved";
    }

    function previewSiteTheme() {
      const selectedTheme = document.getElementById("siteTheme").value;
      if (!SITE_THEMES.includes(selectedTheme)) return;
      document.body.classList.remove(...SITE_THEMES.map(theme => `theme-${theme}`));
      document.body.classList.add(`theme-${selectedTheme}`);
      const status = document.getElementById("themePreviewStatus");
      status.textContent = selectedTheme === siteSettings.theme
        ? "แสดงธีมที่บันทึกไว้"
        : "กำลังดูตัวอย่าง · ยังไม่ได้บันทึก";
      status.dataset.state = selectedTheme === siteSettings.theme ? "saved" : "unsaved";
      markSiteSettingsUnsaved();
    }

    function restoreSiteSettings() {
      applySettingsToForm();
      applySiteTheme();
    }

    function saveSiteSettings(silent = false) {
      const measurementId = document.getElementById("gaMeasurementId").value.trim().toUpperCase();
      if (measurementId && !/^G-[A-Z0-9]{6,}$/.test(measurementId)) {
        if (!silent) alert("Measurement ID ไม่ถูกต้อง ต้องอยู่ในรูปแบบ G-XXXXXXXXXX");
        document.getElementById("gaMeasurementId").focus();
        return false;
      }
      const rawPopup = {
        enabled: document.getElementById("popupEnabled").checked,
        title: document.getElementById("popupTitle").value.trim(),
        message: document.getElementById("popupMessage").value.trim(),
        imageUrl: document.getElementById("popupImageUrl").value.trim(),
        ctaText: document.getElementById("popupCtaText").value.trim(),
        ctaUrl: document.getElementById("popupCtaUrl").value.trim(),
        frequency: document.getElementById("popupFrequency").value
      };
      if (rawPopup.imageUrl && !secureUrl(rawPopup.imageUrl)) {
        if (!silent) alert("URL รูปภาพต้องขึ้นต้นด้วย https://");
        document.getElementById("popupImageUrl").focus();
        return false;
      }
      if (rawPopup.ctaUrl && !secureUrl(rawPopup.ctaUrl)) {
        if (!silent) alert("URL ปุ่มต้องขึ้นต้นด้วย https://");
        document.getElementById("popupCtaUrl").focus();
        return false;
      }
      if ((rawPopup.ctaText && !rawPopup.ctaUrl) || (!rawPopup.ctaText && rawPopup.ctaUrl)) {
        if (!silent) alert("กรุณากรอกทั้งข้อความบนปุ่มและลิงก์ หรือเว้นว่างทั้งสองช่อง");
        document.getElementById(rawPopup.ctaText ? "popupCtaUrl" : "popupCtaText").focus();
        return false;
      }
      if (rawPopup.enabled && (!rawPopup.title || !secureUrl(rawPopup.imageUrl))) {
        if (!silent) alert("เมื่อเปิดป๊อปอัป กรุณาระบุหัวข้อและ URL รูปภาพ HTTPS");
        return false;
      }
      siteSettings = normalizeSiteSettings({
        gaMeasurementId: measurementId,
        theme: document.getElementById("siteTheme").value,
        popup: rawPopup
      });
      try {
        localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(siteSettings));
      } catch (error) {
        console.error("Site settings could not be saved.", error);
        if (!silent) alert("บันทึกการตั้งค่าไม่ได้ เบราว์เซอร์อาจมีพื้นที่จัดเก็บไม่เพียงพอ");
        return false;
      }
      applySiteTheme();
      applySettingsToForm();
      initializeAnalytics();
      document.getElementById("analyticsConsent").hidden =
        !siteSettings.gaMeasurementId || getAnalyticsConsent() !== null;
      schedulePromoPopup();
      if (!silent) alert("บันทึกธีมและป๊อปอัปในเบราว์เซอร์นี้แล้ว · ดาวน์โหลดไฟล์ config เพื่อเผยแพร่บนเว็บจริง");
      return true;
    }

    function exportSiteConfig() {
      if (!saveSiteSettings(true)) return;
      const blob = new Blob([`window.KMUTNB_SITE_CONFIG = ${JSON.stringify(siteSettings, null, 2)};\n`], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "site-config.js";
      link.click();
      URL.revokeObjectURL(url);
    }

    function previewPopup() {
      const rawCtaUrl = document.getElementById("popupCtaUrl").value.trim();
      if (rawCtaUrl && !secureUrl(rawCtaUrl)) {
        alert("ลิงก์ปุ่มต้องขึ้นต้นด้วย https://");
        document.getElementById("popupCtaUrl").focus();
        return;
      }
      const popup = {
        enabled: document.getElementById("popupEnabled").checked,
        title: document.getElementById("popupTitle").value.trim(),
        message: document.getElementById("popupMessage").value.trim(),
        imageUrl: secureUrl(document.getElementById("popupImageUrl").value.trim()),
        ctaText: document.getElementById("popupCtaText").value.trim(),
        ctaUrl: secureUrl(document.getElementById("popupCtaUrl").value.trim()),
        frequency: document.getElementById("popupFrequency").value
      };
      if (!popup.title || !popup.imageUrl) {
        alert("กรุณาระบุหัวข้อและ URL รูปภาพ HTTPS ก่อนดูตัวอย่าง");
        if (!popup.title) document.getElementById("popupTitle").focus();
        else document.getElementById("popupImageUrl").focus();
        return;
      }
      if ((popup.ctaText && !popup.ctaUrl) || (!popup.ctaText && popup.ctaUrl)) {
        alert("กรุณากรอกทั้งข้อความบนปุ่มและลิงก์ หรือเว้นว่างทั้งสองช่อง");
        document.getElementById(popup.ctaText ? "popupCtaUrl" : "popupCtaText").focus();
        return;
      }
      showPromoPopup(true, popup);
    }

    function updatePopupImagePreview() {
      const image = document.getElementById("popupImagePreview");
      const status = document.getElementById("popupImagePreviewStatus");
      if (!image || !status) return;
      const url = secureUrl(document.getElementById("popupImageUrl").value.trim());
      image.hidden = true;
      image.onload = null;
      image.onerror = null;
      if (!url) {
        image.removeAttribute("src");
        status.textContent = document.getElementById("popupImageUrl").value.trim()
          ? "URL ต้องขึ้นต้นด้วย https://"
          : "ใส่ URL เพื่อดูตัวอย่างภาพ";
        return;
      }
      status.textContent = "กำลังโหลดตัวอย่างภาพ…";
      image.onload = () => {
        if (image.dataset.previewUrl !== url) return;
        image.hidden = false;
        status.textContent = "ตัวอย่างภาพ";
      };
      image.onerror = () => {
        if (image.dataset.previewUrl !== url) return;
        image.hidden = true;
        status.textContent = "โหลดภาพไม่ได้ · ตรวจ URL หรือสิทธิ์การเข้าถึง";
      };
      image.dataset.previewUrl = url;
      image.src = url;
    }

    function isPromoAlreadySeen() {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      try {
        return siteSettings.popup.frequency === "session"
          ? sessionStorage.getItem(PROMO_SEEN_KEY) === "seen"
          : localStorage.getItem(PROMO_SEEN_KEY) === today;
      } catch (error) {
        console.warn("Popup display frequency could not be checked.", error);
        return false;
      }
    }

    function markPromoSeen() {
      try {
        if (siteSettings.popup.frequency === "session") {
          sessionStorage.setItem(PROMO_SEEN_KEY, "seen");
        } else {
          const now = new Date();
          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          localStorage.setItem(PROMO_SEEN_KEY, today);
        }
      } catch (error) {
        console.warn("Popup display frequency could not be saved.", error);
      }
    }

    function schedulePromoPopup() {
      if (promoTimer) window.clearTimeout(promoTimer);
      if (!siteSettings || !siteSettings.popup.enabled || isPromoAlreadySeen()) return;
      promoTimer = window.setTimeout(() => {
        if (location.hash === "#cms" || /^#review-/.test(location.hash)) return;
        showPromoPopup(false);
      }, 5000);
    }

    function showPromoPopup(preview, popup = siteSettings.popup) {
      if (!popup.title || !popup.imageUrl) return;
      previousPopupFocus = document.activeElement;
      const overlay = document.getElementById("promoPopup");
      const image = document.getElementById("promoImage");
      const imageError = document.getElementById("promoImageError");
      document.getElementById("promoTitle").textContent = popup.title;
      document.getElementById("promoMessage").textContent = popup.message;
      document.getElementById("promoLabel").textContent = preview ? "ตัวอย่างป๊อปอัป · ยังไม่เผยแพร่" : "ประกาศประชาสัมพันธ์";
      image.hidden = false;
      imageError.hidden = true;
      image.onerror = () => {
        image.hidden = true;
        imageError.hidden = false;
      };
      image.alt = popup.title;
      image.src = popup.imageUrl;
      const cta = document.getElementById("promoCta");
      cta.hidden = !popup.ctaText || !popup.ctaUrl;
      cta.textContent = popup.ctaText;
      if (popup.ctaUrl) cta.href = popup.ctaUrl;
      if (preview) cta.removeAttribute("data-analytics-event");
      else cta.setAttribute("data-analytics-event", "promo_click");
      overlay.hidden = false;
      document.body.classList.add("popup-open");
      overlay.querySelector(".promo-close").focus();
      if (!preview) {
        markPromoSeen();
        trackEvent("promo_view");
      }
    }

    function closePopup() {
      document.getElementById("promoPopup").hidden = true;
      document.body.classList.remove("popup-open");
      if (previousPopupFocus && typeof previousPopupFocus.focus === "function") previousPopupFocus.focus();
      previousPopupFocus = null;
    }

    function handleAnalyticsInteraction(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const custom = target.closest("[data-analytics-event]");
      if (custom) {
        trackEvent(custom.dataset.analyticsEvent);
        return;
      }
      const link = target.closest("a[href]");
      if (link) {
        if (/^#dorm-\d+$/.test(link.getAttribute("href"))) trackEvent("listing_open");
        else if (/google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(link.href)) trackEvent("map_click");
        else if (/facebook\.com|renthub\.in\.th/i.test(link.href)) trackEvent("source_link_click");
        else if (link.hash === "#cms") trackEvent("cms_open");
        return;
      }
    }

    function handlePromoKeyboard(event) {
      const overlay = document.getElementById("promoPopup");
      if (overlay.hidden) return;
      if (event.key === "Escape") {
        closePopup();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...overlay.querySelectorAll("button:not([hidden]), a:not([hidden])")].filter(element => !element.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function updateCalculator() {
      const units = parseInt(document.getElementById("elecUnitsInput").value, 10);
      document.getElementById("elecUnitLabel").textContent = units;
      renderDorms();
      const detailMatch = location.hash.match(/^#dorm-(\d+)$/);
      const reviewMatch = location.hash.match(/^#review-(\d+)$/);
      if (detailMatch) renderDormDetail(Number(detailMatch[1]));
      else if (reviewMatch) renderDormDetail(Number(reviewMatch[1]), true);
    }

    function setZoneFilter(zone) {
      document.getElementById("zoneSelect").value = zone;
      renderDorms();
    }

    function getDailyDormOrder(records) {
      const featured = records.filter(dorm => dorm.sponsored)
        .sort((a, b) => dorms.indexOf(a) - dorms.indexOf(b));
      const others = records.filter(dorm => !dorm.sponsored);
      const today = new Date();
      const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      let seed = [...dayKey].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      for (let index = others.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [others[index], others[swapIndex]] = [others[swapIndex], others[index]];
      }
      return [...featured, ...others];
    }

    function renderDorms() {
      const q = document.getElementById("searchInput").value.trim().toLowerCase();
      const zoneSelect = document.getElementById("zoneSelect");
      const selectedZone = zoneSelect.value;
      const zones = [...new Set([...ZONES, ...dorms.map(dorm => String(dorm.zone || "").trim())].filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "th"));
      const zoneOptionsKey = JSON.stringify(zones);
      if (zoneSelect.dataset.optionsKey !== zoneOptionsKey) {
        zoneSelect.innerHTML = `<option value="all">ทุกย่าน</option>${zones.map(item => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("")}`;
        zoneSelect.dataset.optionsKey = zoneOptionsKey;
      }
      if (selectedZone !== "all" && !zones.includes(selectedZone) &&
        !Array.from(zoneSelect.options).some(option => option.value === selectedZone)) {
        zoneSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHTML(selectedZone)}">${escapeHTML(selectedZone)}</option>`);
      }
      zoneSelect.value = selectedZone || "all";
      const zone = zoneSelect.value;
      const maxPrice = parseInt(document.getElementById("priceSelect").value, 10);
      const type = document.getElementById("typeSelect").value;
      const onlyGovElec = document.getElementById("chkGovElec").checked;
      const onlyLift = document.getElementById("chkLift").checked;
      const onlyPet = document.getElementById("chkPet").checked;
      const elecUnits = parseInt(document.getElementById("elecUnitsInput").value, 10);

      const filtered = getDailyDormOrder(dorms.filter(d => {
        const textBlob = `${d.name} ${d.zone} ${d.type} ${d.desc || ""} ${d.tags.join(" ")}`.toLowerCase();
        if (d.published === false) return false;
        if (q && !textBlob.includes(q)) return false;
        if (zone !== "all" && d.zone !== zone) return false;
        if (d.price > maxPrice) return false;
        if (type !== "all" && d.type !== type) return false;
        if (onlyGovElec && (d.elecRate == null || d.elecRate > 5)) return false;
        if (onlyLift && !/ลิฟต์|ลิฟท์/.test(textBlob)) return false;
        if (onlyPet && !textBlob.includes("เลี้ยงสัตว์")) return false;
        return true;
      }));

      document.getElementById("resultCount").textContent = `พบ ${filtered.length} รายการ`;
      document.querySelectorAll(".zone-tile").forEach(tile => {
        tile.setAttribute("aria-pressed", String(tile.dataset.zone === zone));
      });

      const grid = document.getElementById("dormGrid");
      if (filtered.length === 0) {
        const hasPublishedListings = dorms.some(dorm => dorm.published !== false);
        grid.innerHTML = hasPublishedListings
          ? `<div class="empty-state">ไม่พบรายการที่ตรงกับตัวกรอง ลองปรับคำค้นหา งบประมาณ หรือเลือกย่านอื่น</div>`
          : `<div class="empty-state">ยังไม่มีประกาศที่เผยแพร่ รายการที่นำเข้าทั้งหมดกำลังรอตรวจสอบในฉบับร่าง <a href="#cms">ไปตรวจและจัดการประกาศ →</a></div>`;
        return;
      }

      grid.innerHTML = filtered.map(d => {
        const priceMax = d.priceMax == null ? Number(d.price) : Number(d.priceMax);
        const rentLabel = formatPriceRange(d.price, priceMax);
        const hasElec = d.elecRate != null && Number.isFinite(Number(d.elecRate));
        const hasWater = d.waterEst != null && Number.isFinite(Number(d.waterEst));
        const elecCost = hasElec ? Math.round(elecUnits * Number(d.elecRate)) : null;
        const totalRealCost = hasElec && hasWater ? Number(d.price) + elecCost + Number(d.waterEst) : null;
        return `
          <article class="dorm-card ${d.sponsored ? 'sponsored' : ''}">
            <div class="card-main">
              <div class="card-meta">
                <span class="card-zone">${escapeHTML(d.zone)}</span>
                <div class="card-badges">
                  ${renderAvailability(d)}
                  ${d.sponsored ? '<span class="badge badge-sponsored">แนะนำ</span>' : ''}
                  <span class="badge badge-type">${escapeHTML(d.type)}</span>
                </div>
              </div>
              <h3 class="card-title">${escapeHTML(d.name)}</h3>
              <p class="card-distance">${escapeHTML(d.distance || 'รอบรั้ว มจพ.')}</p>
              <div class="cost-compare">
                <span class="cost-caption">${totalRealCost === null ? "ค่าเช่าต่อเดือน" : `ประมาณการรวม · ${elecUnits} หน่วยไฟ`}</span>
                <div class="cost-total"><strong>${totalRealCost === null ? rentLabel : `฿${totalRealCost.toLocaleString()}`}</strong><span>${totalRealCost === null ? "ราคาอ้างอิง<br>จากต้นทาง" : "รวมค่าเช่า<br>น้ำและไฟ"}</span></div>
                <div class="cost-breakdown"><span>ค่าเช่า ${rentLabel}</span><span>ไฟ ${hasElec ? `${Number(d.elecRate).toLocaleString()} บาท/หน่วย` : "ไม่ระบุ"}</span><span>น้ำ ${hasWater ? `ประมาณ ฿${Number(d.waterEst).toLocaleString()}` : "ไม่ระบุ"}</span></div>
              </div>
              <p class="card-description">${escapeHTML(d.desc)}</p>
              <div class="card-tags">${d.tags.map(tag => `<span class="badge">${escapeHTML(tag)}</span>`).join('')}</div>
            </div>
            <div class="card-footer">
              ${renderPhoneContact(d.contact)}
              <div class="card-actions">
                <a class="card-detail-link" href="#dorm-${Number(d.id)}">ดูรายละเอียด →</a>
                <a class="card-source-link" href="${escapeHTML(getListingUrl(d))}" target="_blank" rel="noopener noreferrer">สอบถาม / ดูรูป ↗</a>
              </div>
            </div>
          </article>
        `;
      }).join('');
    }

    function resetFilters() {
      document.getElementById("searchInput").value = "";
      document.getElementById("zoneSelect").value = "all";
      document.getElementById("priceSelect").value = "99999";
      document.getElementById("typeSelect").value = "all";
      document.getElementById("chkGovElec").checked = false;
      document.getElementById("chkLift").checked = false;
      document.getElementById("chkPet").checked = false;
      renderDorms();
    }

    function formatPriceRange(minimum, maximum) {
      const low = Number(minimum).toLocaleString();
      const high = Number(maximum).toLocaleString();
      return Number(minimum) === Number(maximum) ? `฿${low}` : `฿${low}–${high}`;
    }

    function renderAvailability(dorm) {
      const state = AVAILABILITY_LABELS[dorm.availability] ? dorm.availability : "unknown";
      return `<span class="availability-badge ${state}"><span aria-hidden="true"></span>${AVAILABILITY_LABELS[state]}</span>`;
    }

    function getPhoneNumber(contact) {
      const match = String(contact || "").match(/(?:\+66|0)[\d\s().-]{7,16}/);
      if (!match) return "";
      const digits = match[0].replace(/[^\d+]/g, "");
      if (/^0\d{8,9}$/.test(digits)) return digits;
      if (/^\+66\d{8,9}$/.test(digits)) return digits;
      if (/^66\d{8,9}$/.test(digits)) return `+${digits}`;
      return "";
    }

    function formatPhoneNumber(phone) {
      if (/^0\d{9}$/.test(phone)) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
      if (/^02\d{7}$/.test(phone)) return `02-${phone.slice(2, 5)}-${phone.slice(5)}`;
      if (/^\+66\d{8,9}$/.test(phone)) return `+66 ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
      return phone;
    }

    function renderPhoneContact(contact, context = "card") {
      const phone = getPhoneNumber(contact);
      if (phone) {
        return `<a class="${context}-phone" href="tel:${escapeHTML(phone)}" data-analytics-event="phone_click" aria-label="โทรสอบถาม ${escapeHTML(formatPhoneNumber(phone))}"><span aria-hidden="true">☎</span><strong>${escapeHTML(formatPhoneNumber(phone))}</strong>${context === "detail" ? '<small>แตะเพื่อโทรสอบถามห้องว่าง</small>' : ""}</a>`;
      }
      const fallback = String(contact || "").trim();
      return context === "card"
        ? `<span class="card-contact card-contact-muted">${escapeHTML(fallback || "ดูช่องทางติดต่อในรายละเอียด")}</span>`
        : `<div class="detail-phone-unavailable"><strong>${escapeHTML(fallback || "ยังไม่มีเบอร์ติดต่อ")}</strong><small>เปิดประกาศต้นทางเพื่อสอบถาม</small></div>`;
    }

    function getListingUrl(dorm) {
      const value = dorm.sourceUrl || dorm.fbLink || DEFAULT_SUPPORT_URL;
      try {
        const url = new URL(value);
        if (url.protocol === "https:") return url.href;
      } catch (error) {
        return DEFAULT_SUPPORT_URL;
      }
      return DEFAULT_SUPPORT_URL;
    }

    function updateDormImagePreview() {
      const preview = document.getElementById("dormImagePreview");
      if (!preview) return;
      const urls = document.getElementById("fImageUrls").value
        .split(/[\n,]+/).map(url => url.trim()).filter(Boolean);
      preview.replaceChildren();
      if (!urls.length) {
        preview.textContent = "เพิ่ม URL ภาพเพื่อเช็กตัวอย่างก่อนบันทึก";
        return;
      }
      const count = document.createElement("span");
      count.textContent = `${urls.length} รูป${urls.length > 12 ? " · แสดงตัวอย่าง 12 รูปแรก" : ""}`;
      preview.append(count);
      urls.slice(0, 12).forEach((value, index) => {
        const url = getImageUrl(value);
        if (!url) {
          const invalid = document.createElement("span");
          invalid.textContent = `URL รูปที่ ${index + 1} ต้องเป็น HTTPS`;
          invalid.setAttribute("role", "status");
          preview.append(invalid);
          return;
        }
        const image = document.createElement("img");
        image.src = url;
        image.alt = `ตัวอย่างรูปที่ ${index + 1}`;
        image.loading = "lazy";
        image.onerror = () => {
          image.setAttribute("aria-invalid", "true");
          image.alt = `โหลดรูปที่ ${index + 1} ไม่ได้`;
          image.title = "ตรวจสอบ URL หรือสิทธิ์การเข้าถึงรูป";
        };
        preview.append(image);
      });
    }

    function updateMapUrlPreview() {
      const input = document.getElementById("fMapUrl");
      const link = document.getElementById("fMapPreviewLink");
      const url = getImageUrl(input.value.trim());
      link.hidden = !url;
      if (url) link.href = url;
      else link.removeAttribute("href");
    }

    function getFilteredCmsDorms() {
      const query = document.getElementById("cmsSearchInput").value.trim().toLocaleLowerCase();
      const status = document.getElementById("cmsStatusFilter").value;
      const availability = document.getElementById("cmsAvailabilityFilter").value;
      return [...dorms].filter(dorm => {
        const published = dorm.published !== false;
        const text = `${dorm.name} ${dorm.zone} ${dorm.type} ${dorm.contact || ""} ${dorm.desc || ""}`.toLocaleLowerCase();
        if (query && !text.includes(query)) return false;
        if (status === "published" && !published) return false;
        if (status === "draft" && published) return false;
        if (availability !== "all" && (dorm.availability || "unknown") !== availability) return false;
        return true;
      }).sort((a, b) => Number(Boolean(b.sponsored)) - Number(Boolean(a.sponsored)) ||
        dorms.indexOf(a) - dorms.indexOf(b));
    }

    function updateCmsSelectionControls(visibleDorms = getFilteredCmsDorms()) {
      const selectedIds = [...selectedCmsDormIds].filter(id => dorms.some(dorm => Number(dorm.id) === id));
      selectedCmsDormIds.clear();
      selectedIds.forEach(id => selectedCmsDormIds.add(id));
      const visibleIds = visibleDorms.map(dorm => Number(dorm.id));
      const selectedVisibleCount = visibleIds.filter(id => selectedCmsDormIds.has(id)).length;
      const selectAll = document.getElementById("cmsSelectAll");
      selectAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
      selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
      selectAll.disabled = visibleIds.length === 0;
      document.getElementById("cmsSelectionCount").textContent =
        `เลือก ${selectedIds.length} รายการ${selectedVisibleCount !== selectedIds.length ? ` · ในผลลัพธ์ ${selectedVisibleCount}` : ""}`;
      const hasSelection = selectedIds.length > 0;
      ["cmsBulkPublish", "cmsBulkHide", "cmsBulkDelete", "cmsClearSelection"].forEach(id => {
        document.getElementById(id).disabled = !hasSelection;
      });
      document.getElementById("cmsFilterCount").textContent =
        `แสดง ${visibleDorms.length} จาก ${dorms.length} รายการ`;
    }

    function toggleVisibleCmsSelection(checked) {
      getFilteredCmsDorms().forEach(dorm => {
        const id = Number(dorm.id);
        if (checked) selectedCmsDormIds.add(id);
        else selectedCmsDormIds.delete(id);
      });
      renderCms();
    }

    function toggleCmsSelection(id, checked) {
      const dormId = Number(id);
      if (checked) selectedCmsDormIds.add(dormId);
      else selectedCmsDormIds.delete(dormId);
      updateCmsSelectionControls();
    }

    function clearCmsSelection() {
      selectedCmsDormIds.clear();
      renderCms();
    }

    function refreshAfterCmsBulkAction() {
      try {
        saveToStorage();
      } catch (error) {
        console.error("Bulk listing changes could not be saved.", error);
        alert("บันทึกการเปลี่ยนแปลงไม่ได้ เบราว์เซอร์อาจมีพื้นที่จัดเก็บไม่เพียงพอ");
        dorms = loadDorms();
        renderDorms();
        renderCms();
        return false;
      }
      selectedCmsDormIds.clear();
      renderDorms();
      const detailMatch = location.hash.match(/^#(?:dorm|review)-(\d+)$/);
      if (detailMatch && !dorms.some(dorm => Number(dorm.id) === Number(detailMatch[1]) &&
        (dorm.published !== false || location.hash.startsWith("#review-")))) {
        location.hash = "#dorm-search";
      }
      renderRoute();
      return true;
    }

    function bulkUpdatePublished(publish) {
      const selected = dorms.filter(dorm => selectedCmsDormIds.has(Number(dorm.id)));
      if (!selected.length) return;
      const changedCount = selected.filter(dorm => (dorm.published !== false) !== publish).length;
      if (!changedCount) {
        alert(publish ? "รายการที่เลือกเผยแพร่แล้ว" : "รายการที่เลือกถูกซ่อนอยู่แล้ว");
        return;
      }
      if (publish && !confirm(`ต้องการเผยแพร่ ${changedCount} รายการหรือไม่?\n\nยืนยันว่าตรวจข้อมูลแล้ว และมีสิทธิหรือฐานกฎหมายในการเผยแพร่รูป/ข้อความ/ข้อมูลติดต่อของทุกรายการ`)) return;
      if (!publish && !confirm(`ต้องการซ่อน ${changedCount} รายการที่เลือกจากหน้าค้นหาหรือไม่?`)) return;
      const selectedIds = new Set(selected.map(dorm => Number(dorm.id)));
      dorms = dorms.map(dorm => selectedIds.has(Number(dorm.id)) ? { ...dorm, published: publish } : dorm);
      refreshAfterCmsBulkAction();
    }

    function bulkDeleteSelected() {
      const selectedIds = new Set([...selectedCmsDormIds].filter(id =>
        dorms.some(dorm => Number(dorm.id) === id)));
      if (!selectedIds.size) return;
      if (!confirm(`ลบประกาศที่เลือก ${selectedIds.size} รายการอย่างถาวรจากเบราว์เซอร์นี้หรือไม่? การลบไม่สามารถย้อนกลับได้`)) return;
      dorms = dorms.filter(dorm => !selectedIds.has(Number(dorm.id)));
      refreshAfterCmsBulkAction();
    }

    function renderCms() {
      const publishedCount = dorms.filter(dorm => dorm.published !== false).length;
      document.getElementById("cmsTotal").textContent = dorms.length;
      document.getElementById("cmsPublished").textContent = publishedCount;
      document.getElementById("cmsDrafts").textContent = dorms.length - publishedCount;
      document.getElementById("cmsUpdated").textContent = "การเปลี่ยนแปลงบันทึกในเบราว์เซอร์นี้";
      document.getElementById("supportUrlInput").value = getSupportUrl();
      document.getElementById("siteSupportLink").href = getSupportUrl();
      const rows = document.getElementById("cmsRows");
      if (!dorms.length) {
        rows.innerHTML = '<tr><td colspan="6">ยังไม่มีประกาศ เพิ่มรายการแรกเพื่อเริ่มจัดการ</td></tr>';
        updateCmsSelectionControls([]);
        return;
      }

      const filteredDorms = getFilteredCmsDorms();
      if (!filteredDorms.length) {
        rows.innerHTML = '<tr><td colspan="6">ไม่พบรายการที่ตรงกับตัวกรอง ลองปรับคำค้นหาหรือสถานะ</td></tr>';
        updateCmsSelectionControls([]);
        return;
      }
      rows.innerHTML = filteredDorms.map(dorm => {
        const published = dorm.published !== false;
        const hasSource = Boolean(dorm.sourceUrl || dorm.fbLink);
        const max = dorm.priceMax == null ? dorm.price : dorm.priceMax;
        return `<tr>
          <td class="cms-select-column"><input class="cms-row-select" type="checkbox" aria-label="เลือกรายการ ${escapeHTML(dorm.name)}" ${selectedCmsDormIds.has(Number(dorm.id)) ? "checked" : ""} onchange="toggleCmsSelection(${Number(dorm.id)}, this.checked)"></td>
          <td><span class="cms-item-title">${escapeHTML(dorm.name)}</span><span class="cms-item-subtitle">${escapeHTML(dorm.zone)} · ${(dorm.imageUrls || []).length} รูปเว็บ · ${(dorm.photoUrls || []).length} ลิงก์รูปต้นทาง${hasSource ? ` · <a href="${escapeHTML(getListingUrl(dorm))}" target="_blank" rel="noopener noreferrer">เปิดแหล่งตรวจสอบ ↗</a>` : ""}</span></td>
          <td>${formatPriceRange(dorm.price, max)}</td>
          <td>${renderAvailability(dorm)}</td>
          <td><span class="cms-status ${published ? "" : "draft"}">${published ? "กำลังแสดง" : "ฉบับร่าง"}</span></td>
          <td><div class="cms-row-actions">
            <button type="button" onclick="previewDorm(${Number(dorm.id)})">ตรวจ/ตัวอย่าง</button>
            <button type="button" onclick="editDorm(${Number(dorm.id)})">แก้ไข</button>
            <button type="button" onclick="togglePublished(${Number(dorm.id)})">${published ? "ซ่อน" : "เผยแพร่"}</button>
            <button type="button" onclick="toggleFeatured(${Number(dorm.id)})">${dorm.sponsored ? "ยกเลิกแนะนำ" : "ปักหมุด"}</button>
            <button type="button" onclick="deleteDorm(${Number(dorm.id)})">ลบ</button>
          </div></td>
        </tr>`;
      }).join("");
      updateCmsSelectionControls(filteredDorms);
    }

    function togglePublished(id) {
      const current = dorms.find(dorm => Number(dorm.id) === Number(id));
      if (!current) return;
      const nextState = current.published === false;
      if (nextState && !confirm("ก่อนเผยแพร่ โปรดยืนยันว่าตรวจความถูกต้องของประกาศแล้ว มีสิทธิหรือฐานกฎหมายในการใช้รูป/ข้อความ/ข้อมูลติดต่อ และได้แจ้งเจ้าของข้อมูลเมื่อจำเป็น หากยืนยันไม่ได้ให้เก็บเป็นฉบับร่าง ต้องการเผยแพร่หรือไม่?")) return;
      dorms = dorms.map(dorm => Number(dorm.id) === Number(id) ? { ...dorm, published: nextState } : dorm);
      saveToStorage();
      renderDorms();
      renderCms();
      if (location.hash === `#dorm-${id}` || location.hash === `#review-${id}`) renderRoute();
    }

    function previewDorm(id) {
      location.hash = `#review-${Number(id)}`;
    }

    function toggleFeatured(id) {
      dorms = dorms.map(dorm => Number(dorm.id) === Number(id) ? { ...dorm, sponsored: !dorm.sponsored } : dorm);
      saveToStorage();
      renderDorms();
      renderCms();
      if (location.hash === `#dorm-${id}` || location.hash === `#review-${id}`) renderRoute();
    }

    function saveSupportSettings() {
      const input = document.getElementById("supportUrlInput");
      try {
        const url = new URL(input.value.trim());
        if (url.protocol !== "https:") throw new Error("ช่องทางติดต่อจำเป็นต้องเป็น HTTPS");
        localStorage.setItem(SUPPORT_STORAGE_KEY, url.href);
        document.getElementById("siteSupportLink").href = url.href;
        alert("บันทึกช่องทางติดต่อในเบราว์เซอร์นี้แล้ว");
      } catch (error) {
        alert("ลิงก์ติดต่อไม่ถูกต้อง กรุณาใส่ URL ที่ขึ้นต้นด้วย https://");
        input.focus();
      }
    }

    function renderDormDetail(id, previewMode = false) {
      const dorm = dorms.find(item => Number(item.id) === id);
      const detailPage = document.getElementById("dormDetail");
      const searchSection = document.getElementById("dorm-search");
      if (!dorm || (dorm.published === false && !previewMode)) {
        document.body.classList.remove("showing-detail");
        detailPage.hidden = true;
        searchSection.hidden = false;
        return;
      }

      const units = parseInt(document.getElementById("elecUnitsInput").value, 10);
      const hasElec = dorm.elecRate != null && Number.isFinite(Number(dorm.elecRate));
      const hasWater = dorm.waterEst != null && Number.isFinite(Number(dorm.waterEst));
      const deposit = dorm.deposit != null && Number.isFinite(Number(dorm.deposit)) ? Number(dorm.deposit) : null;
      const elecCost = hasElec ? Math.round(units * Number(dorm.elecRate)) : null;
      const waterCost = hasWater ? Number(dorm.waterEst) : null;
      const totalCost = hasElec && hasWater ? Number(dorm.price) + elecCost + waterCost : null;
      const rentLabel = formatPriceRange(dorm.price, dorm.priceMax == null ? dorm.price : dorm.priceMax);
      const imageUrls = (dorm.imageUrls || []).map(getImageUrl).filter(Boolean);
      const photoUrls = (dorm.photoUrls || []).map(getImageUrl).filter(Boolean);
      const sourceUrl = getListingUrl(dorm);
      const mapUrl = getImageUrl(dorm.mapUrl);
      const gallery = imageUrls.length
        ? `<div class="detail-gallery">
             <button id="detailGalleryOpen" class="gallery-main-button" type="button" aria-label="ขยายภาพที่พัก 1 จาก ${imageUrls.length}" onclick="openImageLightbox(0)">
               <img id="detailGalleryMain" class="gallery-main" src="${escapeHTML(imageUrls[0])}" alt="ภาพที่พัก 1 จาก ${imageUrls.length}" loading="lazy">
               <span class="gallery-zoom-hint"><span aria-hidden="true">⤢</span> แตะเพื่อดูภาพเต็ม</span>
             </button>
             ${imageUrls.length > 1 ? `<div class="gallery-thumbnails" aria-label="เลือกรูปภาพ">${imageUrls.map((url, index) => `<button type="button" class="gallery-thumbnail ${index === 0 ? "active" : ""}" aria-label="แสดงภาพที่พัก ${index + 1}" aria-pressed="${index === 0}" onclick="selectGalleryImage(${Number(dorm.id)}, ${index})"><img src="${escapeHTML(url)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
             <span class="gallery-count">${imageUrls.length} รูป</span>
           </div>`
        : `<div class="detail-cover" role="img" aria-label="ยังไม่มีภาพที่พัก"><span class="detail-cover-label">KMUTNB · ที่พักรอบรั้ว</span><div class="detail-cover-copy"><small>${escapeHTML(dorm.zone)}</small><strong>${escapeHTML(dorm.name)}</strong><span>ยังไม่มีรูปที่พัก</span></div></div>`;
      activeGalleryId = dorm.id;
      activeGalleryImageIndex = 0;

      detailPage.innerHTML = `
        ${previewMode ? '<div class="cms-notice preview-notice">ตัวอย่างฉบับร่าง · ผู้เข้าชมยังไม่เห็นประกาศนี้จนกว่าจะตรวจแล้วกดเผยแพร่</div><a class="detail-back" href="#cms">← กลับไปจัดการประกาศ</a>' : '<a class="detail-back" href="#dorm-search">← กลับไปดูรายการที่พัก</a>'}
        <div class="detail-layout">
          <div class="detail-visual ${imageUrls.length ? "has-gallery" : ""}">${gallery}</div>
          <div class="detail-content">
            <div class="detail-meta"><span>${escapeHTML(dorm.zone)}</span><div class="card-badges">${renderAvailability(dorm)}${dorm.sponsored ? '<span class="badge badge-sponsored">แนะนำ</span>' : ''}<span class="badge badge-type">${escapeHTML(dorm.type)}</span></div></div>
            <h1 class="detail-title">${escapeHTML(dorm.name)}</h1>
            <p class="detail-lead">${escapeHTML(dorm.distance || "รอบรั้ว มจพ.")}</p>
            <div class="detail-price">
              <span class="detail-price-label">${totalCost === null ? "ค่าเช่าต่อเดือนตามประกาศต้นทาง" : `ประมาณการค่าใช้จ่าย · ${units} หน่วยไฟ`}</span>
              <div class="detail-price-total"><strong>${totalCost === null ? rentLabel : `฿${totalCost.toLocaleString()}`}</strong><span>${totalCost === null ? "ยังไม่รวมค่าน้ำ/ไฟ<br>ที่ต้นทางไม่ได้ระบุ" : "รวมค่าเช่า<br>น้ำและไฟ"}</span></div>
              <div class="detail-price-breakdown">
                <span>ค่าเช่า<strong>${rentLabel} / เดือน</strong></span>
                <span>ค่าไฟ<strong>${hasElec ? `${Number(dorm.elecRate).toLocaleString()} บาท/หน่วย · ประมาณ ฿${elecCost.toLocaleString()}` : "ไม่ระบุในต้นทาง"}</strong></span>
                <span>ค่าน้ำ<strong>${hasWater ? `ประมาณ ฿${waterCost.toLocaleString()} / เดือน` : "ไม่ระบุในต้นทาง"}</strong></span>
                <span>เงินประกัน<strong>${deposit === null ? "ไม่ระบุในต้นทาง" : `฿${deposit.toLocaleString()}`}</strong></span>
              </div>
            </div>
            <section class="detail-section">
              <h2>ข้อมูลที่พัก</h2>
              <dl class="detail-specs">
                <div class="detail-spec"><dt>ประเภท</dt><dd>${escapeHTML(dorm.type)}</dd></div>
                <div class="detail-spec"><dt>ทำเล</dt><dd>${escapeHTML(dorm.zone)}</dd></div>
                <div class="detail-spec"><dt>การเดินทาง</dt><dd>${escapeHTML(dorm.distance || "รอบรั้ว มจพ.")}</dd></div>
                <div class="detail-spec"><dt>ค่าไฟ / ค่าน้ำ</dt><dd>${hasElec ? `${Number(dorm.elecRate).toLocaleString()} บาท/หน่วย` : "ค่าไฟไม่ระบุ"} · ${hasWater ? `ค่าน้ำประมาณ ฿${waterCost.toLocaleString()}/เดือน` : "ค่าน้ำไม่ระบุ"}</dd></div>
                <div class="detail-spec"><dt>เงินประกัน / มัดจำ</dt><dd>${deposit === null ? "ไม่ระบุในประกาศ" : `฿${deposit.toLocaleString()}`}</dd></div>
                <div class="detail-spec"><dt>สถานะห้อง</dt><dd>${AVAILABILITY_LABELS[dorm.availability] || AVAILABILITY_LABELS.unknown}</dd></div>
                <div class="detail-spec"><dt>ตำแหน่ง</dt><dd>${mapUrl ? `<a href="${escapeHTML(mapUrl)}" target="_blank" rel="noopener noreferrer">เปิด Google Maps ↗</a>` : "ยังไม่มีลิงก์แผนที่"}</dd></div>
              </dl>
            </section>
            <section class="detail-section"><h2>รายละเอียดประกาศ</h2><p class="detail-description">${escapeHTML(dorm.desc || "ยังไม่มีรายละเอียดเพิ่มเติม")}</p></section>
            <section class="detail-section"><h2>สิ่งอำนวยความสะดวก</h2><div class="detail-tags">${dorm.tags.length ? dorm.tags.map(tag => `<span class="badge">${escapeHTML(tag)}</span>`).join("") : '<span class="detail-description">ยังไม่ได้ระบุ</span>'}</div></section>
            <div class="detail-contact"><div class="detail-contact-copy"><strong>สอบถามห้องว่างกับผู้ลงประกาศ</strong>${renderPhoneContact(dorm.contact, "detail")}</div><a class="detail-button primary" href="${escapeHTML(sourceUrl)}" target="_blank" rel="noopener noreferrer">เปิดประกาศต้นทาง ↗</a></div>
            ${previewMode && (dorm.sourceUrl || dorm.fbLink) ? `<p class="source-note">ลิงก์ตรวจสอบภายใน: <a href="${escapeHTML(getListingUrl(dorm))}" target="_blank" rel="noopener noreferrer">${escapeHTML(dorm.sourceName || "เปิดแหล่งข้อมูล")} ↗</a></p>` : ""}
            ${previewMode && photoUrls.length ? `<div class="source-photo-review"><strong>รูปจากโพสต์ต้นทาง (เปิด Facebook):</strong><div>${photoUrls.map((url, index) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">เปิดรูปที่ ${index + 1} ↗</a>`).join("")}</div></div>` : ""}
            ${previewMode ? `<div class="detail-buttons"><button class="detail-button" type="button" onclick="editDorm(${Number(dorm.id)})">แก้ไขก่อนเผยแพร่</button></div>` : ""}
          </div>
        </div>`;
      detailPage.hidden = false;
      searchSection.hidden = true;
      document.body.classList.add("showing-detail");
    }

    function selectGalleryImage(dormId, imageIndex) {
      const dorm = dorms.find(item => Number(item.id) === Number(dormId));
      const imageUrls = (dorm?.imageUrls || []).map(getImageUrl).filter(Boolean);
      if (Number(dormId) !== Number(activeGalleryId) || !imageUrls[imageIndex]) return;
      activeGalleryImageIndex = imageIndex;
      const mainImage = document.getElementById("detailGalleryMain");
      if (!mainImage) return;
      mainImage.src = imageUrls[imageIndex];
      mainImage.alt = `ภาพที่พัก ${imageIndex + 1} จาก ${imageUrls.length}`;
      const openButton = document.getElementById("detailGalleryOpen");
      openButton.setAttribute("aria-label", `ขยายภาพที่พัก ${imageIndex + 1} จาก ${imageUrls.length}`);
      const lightbox = document.getElementById("imageLightbox");
      if (lightbox.open) showLightboxImage(imageUrls, imageIndex, dorm.name);
      document.querySelectorAll(".gallery-thumbnail").forEach((button, index) => {
        button.classList.toggle("active", index === imageIndex);
        button.setAttribute("aria-pressed", String(index === imageIndex));
      });
    }

    function showLightboxImage(imageUrls, imageIndex, dormName) {
      const lightboxImage = document.getElementById("lightboxImage");
      lightboxImage.src = imageUrls[imageIndex];
      lightboxImage.alt = `${dormName} · ภาพที่ ${imageIndex + 1} จาก ${imageUrls.length}`;
      document.getElementById("lightboxCaption").textContent = `${dormName} · ${imageIndex + 1} / ${imageUrls.length}`;
      document.getElementById("lightboxPrevious").hidden = imageUrls.length < 2;
      document.getElementById("lightboxNext").hidden = imageUrls.length < 2;
    }

    function openImageLightbox(imageIndex = activeGalleryImageIndex) {
      const dorm = dorms.find(item => Number(item.id) === Number(activeGalleryId));
      const imageUrls = (dorm?.imageUrls || []).map(getImageUrl).filter(Boolean);
      if (!dorm || !imageUrls.length || !imageUrls[imageIndex]) return;
      activeGalleryImageIndex = imageIndex;
      galleryReturnFocus = document.getElementById("detailGalleryOpen");
      showLightboxImage(imageUrls, imageIndex, dorm.name);
      document.getElementById("imageLightbox").showModal();
      document.body.classList.add("gallery-open");
      document.getElementById("lightboxClose").focus();
    }

    function moveLightboxImage(direction) {
      const dorm = dorms.find(item => Number(item.id) === Number(activeGalleryId));
      const imageUrls = (dorm?.imageUrls || []).map(getImageUrl).filter(Boolean);
      if (!imageUrls.length) return;
      const nextIndex = (activeGalleryImageIndex + direction + imageUrls.length) % imageUrls.length;
      selectGalleryImage(dorm.id, nextIndex);
    }

    function closeImageLightbox() {
      const lightbox = document.getElementById("imageLightbox");
      if (!lightbox.open) return;
      lightbox.close();
      restoreGalleryFocus();
    }

    function restoreGalleryFocus() {
      document.body.classList.remove("gallery-open");
      if (galleryReturnFocus?.isConnected) galleryReturnFocus.focus();
      galleryReturnFocus = null;
    }

    function renderRoute() {
      const cmsDashboard = document.getElementById("cmsDashboard");
      const searchSection = document.getElementById("dorm-search");
      const detailPage = document.getElementById("dormDetail");
      const isCmsRoute = location.hash === "#cms";
      document.body.classList.toggle("showing-cms", isCmsRoute);
      cmsDashboard.hidden = !isCmsRoute;
      if (isCmsRoute) {
        document.body.classList.remove("showing-detail");
        searchSection.hidden = true;
        detailPage.hidden = true;
        renderCms();
        return;
      }

      const match = location.hash.match(/^#dorm-(\d+)$/);
      if (match) {
        document.body.classList.remove("showing-cms");
        renderDormDetail(Number(match[1]));
        if (!detailPage.hidden) {
          detailPage.scrollIntoView({ block: "start" });
        }
        return;
      }
      const reviewMatch = location.hash.match(/^#review-(\d+)$/);
      if (reviewMatch) {
        document.body.classList.remove("showing-cms");
        renderDormDetail(Number(reviewMatch[1]), true);
        if (!detailPage.hidden) detailPage.scrollIntoView({ block: "start" });
        return;
      }
      document.body.classList.remove("showing-detail");
      document.body.classList.remove("showing-cms");
      detailPage.hidden = true;
      searchSection.hidden = false;
    }

    // Smart Regex Parser for Facebook Group Posts
    function parseFacebookPost() {
      const raw = document.getElementById("fbRawText").value.trim();
      if (!raw) {
        alert("กรุณาวางข้อความจากโพสต์ในกลุ่ม Facebook ก่อนครับ");
        return;
      }

      // Extract first line as title
      const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
      document.getElementById("fName").value = (lines[0] || "ประกาศหอพัก มจพ.").slice(0, 70);
      const sourceMatch = raw.match(/https:\/\/(?:www\.)?(?:facebook\.com|renthub\.in\.th)\/[^\s]+/i);
      if (sourceMatch) document.getElementById("fSourceUrl").value = sourceMatch[0].replace(/[),.]+$/, "");

      // Detect Zone
      if (/วงศ์สว่าง\s*11|ศรีพรหม|หลัง\s*ม/i.test(raw)) {
        document.getElementById("fZone").value = "ซอยวงศ์สว่าง 11";
      } else if (/ประชาราษฎร์|หน้า\s*ม|ตลาดเขมา/i.test(raw)) {
        document.getElementById("fZone").value = "ประชาราษฎร์สาย 1 (หน้า ม.)";
      } else if (/mrt|ศุภาลัย|พาร์คแลนด์|บิ๊กซี|วงศ์สว่าง\s*19|วงศ์สว่าง\s*7/i.test(raw)) {
        document.getElementById("fZone").value = "MRT วงศ์สว่าง / ถนนวงศ์สว่าง";
      } else if (/พระราม\s*7|จรัญ/i.test(raw)) {
        document.getElementById("fZone").value = "สะพานพระราม 7 / จรัญฯ";
      }

      // Detect Type
      if (/ขายสัญญา|หาเมท|หารูมเมท/i.test(raw)) {
        document.getElementById("fType").value = "ขายสัญญาหอ / หารูมเมท";
      } else if (/หอหญิง|สตรี/i.test(raw)) {
        document.getElementById("fType").value = "หอหญิงล้วน";
      } else if (/คอนโด|ศุภาลัย|พาร์คแลนด์|ลุมพินี/i.test(raw)) {
        document.getElementById("fType").value = "คอนโดปล่อยเช่า";
      }

      // Detect Monthly Rent (e.g., 3,500 or 4000)
      const priceMatch = raw.match(/(?:เดือนละ|ค่าเช่า|ราคา|ห้องละ)?\s*([2-9],?\d{3}|\d{2},\d{3})\s*(?:บาท|บ\.|\/ด)/i) || raw.match(/([2-9],\d{3})/);
      if (priceMatch) {
        document.getElementById("fPrice").value = priceMatch[1].replace(/,/g, "");
      }
      document.getElementById("fDeposit").value = "";
      const depositMatch = raw.match(/(?:เงินประกัน|ค่าประกัน|ประกัน|มัดจำ)\s*(?:ห้อง|จำนวน)?\s*[:=]?\s*([\d,]+)/i);
      if (depositMatch && !/^เดือน/.test(raw.slice(depositMatch.index + depositMatch[0].length).trimStart())) {
        document.getElementById("fDeposit").value = depositMatch[1].replace(/,/g, "");
      }

      // Detect Electricity Rate
      if (/ไฟหลวง|การไฟฟ้า/i.test(raw)) {
        document.getElementById("fElec").value = 4.2;
      } else {
        const elecMatch = raw.match(/ไฟ(?:ฟ้า)?\s*(?:หน่วยละ)?\s*(\d+(?:\.\d+)?)/i);
        if (elecMatch) document.getElementById("fElec").value = elecMatch[1];
      }

      // Detect Phone / Line
      const phoneMatch = raw.match(/(0[689]\d[- ]?\d{3}[- ]?\d{4})/);
      const lineMatch = raw.match(/(?:line|ไลน์)\s*[:id]*\s*([a-zA-Z0-9._@-]+)/i);
      const contacts = [];
      if (phoneMatch) contacts.push(phoneMatch[1]);
      if (lineMatch) contacts.push("Line: " + lineMatch[1]);
      if (contacts.length) document.getElementById("fContact").value = contacts.join(" / ");
      if (/เต็ม|ไม่มีห้องว่าง/i.test(raw)) document.getElementById("fAvailability").value = "full";
      else if (/มีห้องว่าง|ห้องว่าง|ว่างพร้อมเข้า/i.test(raw)) document.getElementById("fAvailability").value = "available";

      // Auto-extract Facility Tags
      const possibleTags = [
        ["แอร์", /แอร์|เครื่องปรับอากาศ/i],
        ["เครื่องทำน้ำอุ่น", /น้ำอุ่น/i],
        ["มีลิฟต์", /ลิฟต์|ลิฟท์/i],
        ["คีย์การ์ด", /คีย์การ์ด|สแกนนิ้ว/i],
        ["ค่าไฟหลวง", /ไฟหลวง/i],
        ["เลี้ยงสัตว์ได้", /เลี้ยงสัตว์|แมว|หมา/i],
        ["ฟรี Wi-Fi", /wifi|ไวไฟ|เน็ตฟรี/i],
        ["เครื่องซักผ้า", /ซักผ้า/i]
      ];
      const matchedTags = possibleTags.filter(([_, rx]) => rx.test(raw)).map(([label]) => label);
      document.getElementById("fTags").value = matchedTags.join(", ");

      document.getElementById("fDesc").value = raw;
    }

    function openAddModal() {
      editingDormId = null;
      document.querySelector("#addModal form").reset();
      document.getElementById("fSourceUrl").value = "";
      document.getElementById("fbRawText").value = "";
      document.getElementById("fImageUrls").value = "";
      document.getElementById("fMapUrl").value = "";
      document.getElementById("fPhotoUrls").value = "";
      document.getElementById("fDeposit").value = "";
      updateDormImagePreview();
      updateMapUrlPreview();
      document.getElementById("fPublished").checked = false;
      document.getElementById("fAvailability").value = "unknown";
      document.getElementById("addModalTitle").textContent = "เพิ่มประกาศที่พัก";
      document.getElementById("saveDormButton").textContent = "บันทึกประกาศ";
      openModal("addModal");
    }

    function editDorm(id) {
      const dorm = dorms.find(item => Number(item.id) === Number(id));
      if (!dorm) return;
      editingDormId = id;
      document.getElementById("fName").value = dorm.name;
      document.getElementById("fZone").value = dorm.zone;
      document.getElementById("fPrice").value = dorm.price;
      document.getElementById("fPriceMax").value = dorm.priceMax == null || Number(dorm.priceMax) === Number(dorm.price) ? "" : dorm.priceMax;
      document.getElementById("fElec").value = dorm.elecRate ?? "";
      document.getElementById("fWater").value = dorm.waterEst ?? "";
      document.getElementById("fType").value = dorm.type;
      document.getElementById("fDistance").value = dorm.distance || "";
      document.getElementById("fContact").value = dorm.contact || "";
      document.getElementById("fDeposit").value = dorm.deposit ?? "";
      document.getElementById("fSourceUrl").value = dorm.sourceUrl || dorm.fbLink || "";
      document.getElementById("fImageUrls").value = (dorm.imageUrls || (dorm.imageUrl ? [dorm.imageUrl] : [])).join("\n");
      document.getElementById("fMapUrl").value = dorm.mapUrl || "";
      updateMapUrlPreview();
      document.getElementById("fPhotoUrls").value = (dorm.photoUrls || []).join("\n");
      document.getElementById("fTags").value = dorm.tags.join(", ");
      document.getElementById("fSponsored").checked = Boolean(dorm.sponsored);
      document.getElementById("fPublished").checked = dorm.published !== false;
      document.getElementById("fAvailability").value = AVAILABILITY_LABELS[dorm.availability] ? dorm.availability : "unknown";
      document.getElementById("fDesc").value = dorm.desc || "";
      document.getElementById("fbRawText").value = "";
      updateDormImagePreview();
      document.getElementById("addModalTitle").textContent = "แก้ไขประกาศ";
      document.getElementById("saveDormButton").textContent = "บันทึกการแก้ไข";
      openModal("addModal");
    }

    function saveDorm(e) {
      e.preventDefault();
      const minimumRent = Number(document.getElementById("fPrice").value);
      const enteredMaximum = document.getElementById("fPriceMax").value.trim();
      const maximumRent = enteredMaximum ? Number(enteredMaximum) : minimumRent;
      if (maximumRent < minimumRent) {
        alert("ค่าเช่าสูงสุดต้องไม่น้อยกว่าค่าเช่าต่ำสุด");
        document.getElementById("fPriceMax").focus();
        return;
      }
      const sourceUrl = document.getElementById("fSourceUrl").value.trim();
      const imageUrls = document.getElementById("fImageUrls").value.split(/[\n,]+/).map(url => url.trim()).filter(Boolean);
      const validImageUrls = imageUrls.map(getImageUrl);
      const photoUrls = document.getElementById("fPhotoUrls").value.split(/[\n,]+/).map(url => url.trim()).filter(Boolean);
      const validPhotoUrls = photoUrls.map(getImageUrl);
      const mapUrl = document.getElementById("fMapUrl").value.trim();
      if (validImageUrls.some(url => !url)) {
        alert("ลิงก์รูปภาพต้องขึ้นต้นด้วย https:// และเป็น URL ที่ถูกต้อง");
        document.getElementById("fImageUrls").focus();
        return;
      }
      if (sourceUrl && !getImageUrl(sourceUrl)) {
        alert("ลิงก์แหล่งประกาศต้องขึ้นต้นด้วย https://");
        document.getElementById("fSourceUrl").focus();
        return;
      }
      if (validPhotoUrls.some(url => !url)) {
        alert("ลิงก์รูปจากโพสต์ต้องเป็น URL HTTPS ที่ถูกต้อง");
        document.getElementById("fPhotoUrls").focus();
        return;
      }
      if (mapUrl && !getImageUrl(mapUrl)) {
        alert("ลิงก์ Google Maps ต้องเป็น URL HTTPS ที่ถูกต้อง");
        document.getElementById("fMapUrl").focus();
        return;
      }
      const enteredDeposit = document.getElementById("fDeposit").value.trim();
      const deposit = enteredDeposit ? Number(enteredDeposit) : null;
      if (enteredDeposit && (!Number.isFinite(deposit) || deposit < 0)) {
        alert("เงินประกันต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป");
        document.getElementById("fDeposit").focus();
        return;
      }
      const previousDorm = editingDormId === null ? null : dorms.find(dorm => Number(dorm.id) === Number(editingDormId));
      let sourceName = previousDorm?.sourceName || "";
      if (sourceUrl) {
        try {
          sourceName = new URL(sourceUrl).hostname.replace(/^www\./, "");
        } catch (error) {
          sourceName = "";
        }
      }
      const shouldPublish = document.getElementById("fPublished").checked;
      if (shouldPublish &&
        !confirm("ก่อนบันทึกประกาศที่เปิดเผยต่อสาธารณะ โปรดยืนยันว่าตรวจความถูกต้องแล้ว มีสิทธิหรือฐานกฎหมายในการใช้รูป/ข้อความ/ข้อมูลติดต่อ และแจ้งเจ้าของข้อมูลเมื่อจำเป็น หากยืนยันไม่ได้ให้ยกเลิกการแสดงประกาศ ต้องการดำเนินการต่อหรือไม่?")) return;
      const newDorm = {
        id: editingDormId ?? Date.now(),
        name: document.getElementById("fName").value.trim(),
        zone: document.getElementById("fZone").value,
        type: document.getElementById("fType").value,
        price: minimumRent,
        priceMax: maximumRent,
        deposit,
        elecRate: document.getElementById("fElec").value.trim() ? Number(document.getElementById("fElec").value) : null,
        waterEst: document.getElementById("fWater").value.trim() ? Number(document.getElementById("fWater").value) : null,
        distance: document.getElementById("fDistance").value.trim() || "ใกล้ มจพ.",
        contact: document.getElementById("fContact").value.trim() || "ดูในโพสต์กลุ่ม FB",
        sourceUrl,
        sourceName,
        imageUrls: validImageUrls,
        photoUrls: validPhotoUrls,
        mapUrl: getImageUrl(mapUrl),
        tags: document.getElementById("fTags").value.split(",").map(s => s.trim()).filter(Boolean),
        desc: document.getElementById("fDesc").value.trim(),
        sponsored: document.getElementById("fSponsored").checked,
        availability: document.getElementById("fAvailability").value,
        published: shouldPublish
      };
      if (editingDormId === null) dorms.unshift(newDorm);
      else dorms = dorms.map(dorm => Number(dorm.id) === Number(editingDormId) ? { ...dorm, ...newDorm } : dorm);
      saveToStorage();
      renderDorms();
      renderRoute();
      closeModal('addModal');
      e.target.reset();
      document.getElementById("fbRawText").value = "";
      document.getElementById("fImageUrls").value = "";
      document.getElementById("fMapUrl").value = "";
      document.getElementById("fPhotoUrls").value = "";
      document.getElementById("fDeposit").value = "";
      updateDormImagePreview();
      updateMapUrlPreview();
      editingDormId = null;
      renderCms();
      document.getElementById("addModalTitle").textContent = "เพิ่มประกาศที่พัก";
      document.getElementById("saveDormButton").textContent = "บันทึกประกาศ";
    }

    function deleteDorm(id) {
      if (!confirm("ต้องการลบรายการหอพักนี้ใช่หรือไม่?")) return;
      dorms = dorms.filter(d => Number(d.id) !== Number(id));
      saveToStorage();
      renderDorms();
      if (location.hash === `#dorm-${id}`) location.hash = "#dorm-search";
      else renderRoute();
      renderCms();
    }

    function exportJSON() {
      const blob = new Blob([JSON.stringify(dorms, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kmutnb-dorms.json";
      a.click();
      URL.revokeObjectURL(url);
    }

    function importJSON(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported) || !imported.length || !imported.every(isValidDorm)) {
            throw new Error("ข้อมูลไม่ตรงรูปแบบ");
          }
          const ids = imported.map(dorm => Number(dorm.id));
          if (new Set(ids).size !== ids.length) throw new Error("พบรหัสรายการซ้ำกัน");
          if (!confirm(`นำเข้าข้อมูล ${imported.length} รายการและแทนที่ข้อมูลปัจจุบันหรือไม่?`)) return;
          dorms = imported.map(normalizeDorm);
          saveToStorage();
          renderDorms();
          renderRoute();
          alert("นำเข้าข้อมูลหอพักเรียบร้อยแล้ว");
        } catch (error) {
          alert("นำเข้าไม่สำเร็จ: กรุณาเลือกไฟล์ JSON ที่ส่งออกจาก KMUTNB Dorm Hub และตรวจสอบข้อมูลอีกครั้ง");
        } finally {
          event.target.value = "";
        }
      };
      reader.readAsText(file);
    }

    function openModal(id) {
      const el = document.getElementById(id);
      modalReturnFocus = document.activeElement;
      el.classList.remove("hidden");
      el.classList.add("flex");
      document.body.classList.add("modal-open");
      const firstField = el.querySelector("#fbRawText") ||
        el.querySelector("textarea, input:not([type=hidden]), select, button");
      if (firstField) firstField.focus();
    }

    function closeModal(id) {
      const el = document.getElementById(id);
      el.classList.add("hidden");
      el.classList.remove("flex");
      document.body.classList.remove("modal-open");
      if (modalReturnFocus && typeof modalReturnFocus.focus === "function") modalReturnFocus.focus();
      modalReturnFocus = null;
    }

    function handleAddModalKeyboard(event) {
      const modal = document.getElementById("addModal");
      if (!modal.classList.contains("flex")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal("addModal");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href]")]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    siteSettings = loadSiteSettings();
    applySiteTheme();
    window.addEventListener("hashchange", () => {
      renderRoute();
      trackPageView();
      schedulePromoPopup();
      if (location.hash === "#privacy-settings" && siteSettings.gaMeasurementId) {
        document.getElementById("analyticsConsent").hidden = false;
        document.getElementById("consentReject").focus();
      }
    });
    document.addEventListener("click", handleAnalyticsInteraction);
    document.addEventListener("change", event => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target && target.closest("select, input[type=checkbox], input[type=radio]");
      if (control && ["zoneSelect", "priceSelect", "typeSelect"].includes(control.id)) {
        trackEvent("filter_change", { filter_name: control.id });
      }
    });
    document.addEventListener("keydown", handlePromoKeyboard);
    document.addEventListener("keydown", handleAddModalKeyboard);
    document.addEventListener("keydown", event => {
      const lightbox = document.getElementById("imageLightbox");
      if (!lightbox.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeImageLightbox();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveLightboxImage(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveLightboxImage(-1);
      }
    });
    document.getElementById("imageLightbox").addEventListener("click", event => {
      if (event.target === event.currentTarget) closeImageLightbox();
    });
    document.getElementById("imageLightbox").addEventListener("close", restoreGalleryFocus);
    document.getElementById("imageLightbox").addEventListener("cancel", event => {
      event.preventDefault();
      closeImageLightbox();
    });
    document.getElementById("imageLightbox").querySelector(".lightbox-stage").addEventListener("touchstart", event => {
      const touch = event.changedTouches[0];
      lightboxTouchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    document.getElementById("imageLightbox").querySelector(".lightbox-stage").addEventListener("touchend", event => {
      if (!lightboxTouchStart) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - lightboxTouchStart.x;
      const deltaY = touch.clientY - lightboxTouchStart.y;
      lightboxTouchStart = null;
      if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY)) return;
      moveLightboxImage(deltaX < 0 ? 1 : -1);
    }, { passive: true });
    document.getElementById("promoPopup").addEventListener("click", event => {
      if (event.target.id === "promoPopup") closePopup();
    });
    document.getElementById("fImageUrls").addEventListener("input", updateDormImagePreview);
    document.getElementById("fMapUrl").addEventListener("input", updateMapUrlPreview);
    document.getElementById("siteToolsHeading").closest(".site-tools-panel").addEventListener("input", event => {
      if (event.target.matches("input, textarea")) markSiteSettingsUnsaved();
    });
    document.getElementById("siteToolsHeading").closest(".site-tools-panel").addEventListener("change", event => {
      if (event.target.matches("select, input[type=checkbox]")) markSiteSettingsUnsaved();
    });
    let searchAnalyticsTimer = null;
    document.getElementById("searchInput").addEventListener("input", () => {
      window.clearTimeout(searchAnalyticsTimer);
      searchAnalyticsTimer = window.setTimeout(() => trackEvent("search_used"), 900);
    });
    document.getElementById("siteSupportLink").href = getSupportUrl();
    renderDorms();
    renderRoute();
    applySettingsToForm();
    if (siteSettings.gaMeasurementId && getAnalyticsConsent() === null) {
      document.getElementById("analyticsConsent").hidden = false;
    }
    if (location.hash === "#privacy-settings" && siteSettings.gaMeasurementId) {
      document.getElementById("analyticsConsent").hidden = false;
    }
    if (getAnalyticsConsent() === "accepted") initializeAnalytics();
    schedulePromoPopup();
