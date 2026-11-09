(() => {
  "use strict";

  const STORAGE_KEY = "phrase-pocket-data-v1";
  const THEME_KEY = "phrase-pocket-theme";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  const sourceLabels = {
    work: "محیط کار",
    daily: "روزمره",
    podcast: "پادکست",
    other: "سایر",
  };

  const els = {
    form: document.querySelector("#phraseForm"),
    editingId: document.querySelector("#editingId"),
    expression: document.querySelector("#expression"),
    meaning: document.querySelector("#meaning"),
    heardSentence: document.querySelector("#heardSentence"),
    mySentence: document.querySelector("#mySentence"),
    source: document.querySelector("#source"),
    tag: document.querySelector("#tag"),
    formTitle: document.querySelector("#formTitle"),
    resetFormButton: document.querySelector("#resetFormButton"),
    saveButton: document.querySelector("#saveButton"),
    saveInboxButton: document.querySelector("#saveInboxButton"),
    phraseList: document.querySelector("#phraseList"),
    libraryEmpty: document.querySelector("#libraryEmpty"),
    searchInput: document.querySelector("#searchInput"),
    filterSelect: document.querySelector("#filterSelect"),
    totalCount: document.querySelector("#totalCount"),
    dueCount: document.querySelector("#dueCount"),
    masteredCount: document.querySelector("#masteredCount"),
    themeButton: document.querySelector("#themeButton"),
    tabs: [...document.querySelectorAll(".tab-button")],
    panels: [...document.querySelectorAll(".tab-panel")],
    reviewCard: document.querySelector("#reviewCard"),
    reviewEmpty: document.querySelector("#reviewEmpty"),
    reviewProgress: document.querySelector("#reviewProgress"),
    reviewSource: document.querySelector("#reviewSource"),
    reviewLevel: document.querySelector("#reviewLevel"),
    reviewExpression: document.querySelector("#reviewExpression"),
    reviewMeaning: document.querySelector("#reviewMeaning"),
    reviewHeard: document.querySelector("#reviewHeard"),
    reviewMine: document.querySelector("#reviewMine"),
    heardAnswerBlock: document.querySelector("#heardAnswerBlock"),
    myAnswerBlock: document.querySelector("#myAnswerBlock"),
    revealButton: document.querySelector("#revealButton"),
    reviewAnswer: document.querySelector("#reviewAnswer"),
    ratingButtons: [...document.querySelectorAll(".rating-button")],
    reviewAllButton: document.querySelector("#reviewAllButton"),
    exportButton: document.querySelector("#exportButton"),
    importInput: document.querySelector("#importInput"),
    clearButton: document.querySelector("#clearButton"),
    toast: document.querySelector("#toast"),
    offlineStatus: document.querySelector("#offlineStatus"),
  };

  let state = loadState();
  let reviewQueue = [];
  let reviewIndex = 0;
  let reviewAllMode = false;
  let reviewCompleted = 0;
  let reviewSessionTotal = 0;
  let toastTimer;

  function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createEmptyState() {
    return {
      version: 1,
      phrases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.phrases)) return createEmptyState();
      return {
        ...createEmptyState(),
        ...parsed,
        phrases: parsed.phrases.map(normalizePhrase),
      };
    } catch (error) {
      console.error("Could not load saved data", error);
      return createEmptyState();
    }
  }

  function normalizePhrase(item) {
    const now = Date.now();
    return {
      id: item.id || makeId(),
      expression: String(item.expression || "").trim(),
      meaning: String(item.meaning || "").trim(),
      heardSentence: String(item.heardSentence || "").trim(),
      mySentence: String(item.mySentence || "").trim(),
      source: sourceLabels[item.source] ? item.source : "other",
      tag: String(item.tag || "").trim(),
      inbox: Boolean(item.inbox),
      intervalDays: Number.isFinite(Number(item.intervalDays)) ? Number(item.intervalDays) : 0,
      reviewCount: Number.isFinite(Number(item.reviewCount)) ? Number(item.reviewCount) : 0,
      dueAt: Number.isFinite(Number(item.dueAt)) ? Number(item.dueAt) : now,
      createdAt: item.createdAt || new Date(now).toISOString(),
      updatedAt: item.updatedAt || new Date(now).toISOString(),
      lastReviewedAt: item.lastReviewedAt || null,
    };
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toPersianNumber(value) {
    return new Intl.NumberFormat("fa-IR").format(value);
  }

  function formatDate(timestamp) {
    try {
      return new Intl.DateTimeFormat("fa-IR", {
        month: "short",
        day: "numeric",
      }).format(new Date(timestamp));
    } catch {
      return "";
    }
  }

  function dueLabel(phrase) {
    if (phrase.inbox) return "برای تکمیل بعدی";
    const delta = phrase.dueAt - Date.now();
    if (delta <= 0) return "آماده مرور";
    if (delta < DAY_MS) {
      const hours = Math.max(1, Math.ceil(delta / (60 * 60 * 1000)));
      return `${toPersianNumber(hours)} ساعت دیگر`;
    }
    return `مرور بعدی: ${formatDate(phrase.dueAt)}`;
  }

  function isMastered(phrase) {
    return phrase.intervalDays >= 21 && phrase.reviewCount >= 4;
  }

  function getDuePhrases() {
    const now = Date.now();
    return state.phrases
      .filter((phrase) => !phrase.inbox && phrase.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt || a.createdAt.localeCompare(b.createdAt));
  }

  function renderStats() {
    const due = getDuePhrases().length;
    const mastered = state.phrases.filter(isMastered).length;
    els.totalCount.textContent = toPersianNumber(state.phrases.length);
    els.dueCount.textContent = toPersianNumber(due);
    els.masteredCount.textContent = toPersianNumber(mastered);
  }

  function renderLibrary() {
    const query = els.searchInput.value.trim().toLocaleLowerCase("en");
    const filter = els.filterSelect.value;
    const now = Date.now();

    const filtered = state.phrases
      .filter((phrase) => {
        const haystack = [
          phrase.expression,
          phrase.meaning,
          phrase.heardSentence,
          phrase.mySentence,
          phrase.tag,
          sourceLabels[phrase.source],
        ]
          .join(" ")
          .toLocaleLowerCase("en");

        const matchesQuery = !query || haystack.includes(query);
        const matchesFilter =
          filter === "all" ||
          (filter === "due" && !phrase.inbox && phrase.dueAt <= now) ||
          (filter === "inbox" && phrase.inbox) ||
          (filter === "mastered" && isMastered(phrase));

        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        if (a.inbox !== b.inbox) return a.inbox ? -1 : 1;
        if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
        return b.createdAt.localeCompare(a.createdAt);
      });

    els.phraseList.innerHTML = filtered.map(renderPhraseCard).join("");
    const showEmpty = filtered.length === 0;
    els.libraryEmpty.classList.toggle("hidden", !showEmpty);
  }

  function renderPhraseCard(phrase) {
    const examples = [
      phrase.heardSentence
        ? `<div class="example-row"><span>جمله‌ای که شنیدی</span><p class="ltr">${escapeHtml(phrase.heardSentence)}</p></div>`
        : "",
      phrase.mySentence
        ? `<div class="example-row"><span>جمله‌ی خودت</span><p class="ltr">${escapeHtml(phrase.mySentence)}</p></div>`
        : "",
    ].join("");

    const tags = [
      `<span class="source-badge">${escapeHtml(sourceLabels[phrase.source])}</span>`,
      phrase.tag ? `<span class="meta-badge">#${escapeHtml(phrase.tag)}</span>` : "",
      phrase.inbox ? `<span class="meta-badge">تکمیل نشده</span>` : "",
      isMastered(phrase) ? `<span class="meta-badge">یادگرفته‌شده</span>` : "",
    ].join("");

    return `
      <article class="phrase-card ${phrase.inbox ? "inbox" : ""}" data-id="${escapeHtml(phrase.id)}">
        <div class="phrase-card-header">
          <div>
            <h3 class="phrase-expression ltr">${escapeHtml(phrase.expression)}</h3>
            <p class="phrase-meaning">${escapeHtml(phrase.meaning || "هنوز معنی اضافه نشده")}</p>
          </div>
          <div class="card-menu">
            <button class="card-action edit-phrase" type="button" aria-label="ویرایش" title="ویرایش">✎</button>
            <button class="card-action delete delete-phrase" type="button" aria-label="حذف" title="حذف">×</button>
          </div>
        </div>
        ${examples ? `<div class="phrase-examples">${examples}</div>` : ""}
        <div class="card-footer">
          <div class="badge-row">${tags}</div>
          <span class="due-text">${escapeHtml(dueLabel(phrase))}</span>
        </div>
      </article>
    `;
  }

  function renderAll() {
    renderStats();
    renderLibrary();
    if (document.querySelector('[data-panel="review"]').classList.contains("active")) {
      refreshReviewQueue(false);
    }
  }

  function collectFormData(inbox = false) {
    return {
      expression: els.expression.value.trim(),
      meaning: els.meaning.value.trim(),
      heardSentence: els.heardSentence.value.trim(),
      mySentence: els.mySentence.value.trim(),
      source: els.source.value,
      tag: els.tag.value.trim(),
      inbox,
    };
  }

  function upsertPhrase(data) {
    if (!data.expression) {
      showToast("عبارت انگلیسی را وارد کن");
      els.expression.focus();
      return false;
    }

    const now = Date.now();
    const editingId = els.editingId.value;

    if (editingId) {
      const index = state.phrases.findIndex((item) => item.id === editingId);
      if (index === -1) return false;
      const existing = state.phrases[index];
      state.phrases[index] = {
        ...existing,
        ...data,
        dueAt: data.inbox ? existing.dueAt : Math.min(existing.dueAt, now),
        updatedAt: new Date(now).toISOString(),
      };
      showToast("تغییرات ذخیره شد");
    } else {
      state.phrases.push({
        id: makeId(),
        ...data,
        intervalDays: 0,
        reviewCount: 0,
        dueAt: now,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        lastReviewedAt: null,
      });
      showToast(data.inbox ? "برای تکمیل بعدی ذخیره شد" : "عبارت ذخیره شد");
    }

    saveState();
    resetForm();
    renderAll();
    return true;
  }

  function resetForm() {
    els.form.reset();
    els.source.value = "work";
    els.editingId.value = "";
    els.formTitle.textContent = "یادداشت سریع";
    els.saveButton.textContent = "ذخیره عبارت";
    els.resetFormButton.classList.add("hidden");
    document.querySelector(".more-fields").open = false;
  }

  function editPhrase(id) {
    const phrase = state.phrases.find((item) => item.id === id);
    if (!phrase) return;

    els.editingId.value = phrase.id;
    els.expression.value = phrase.expression;
    els.meaning.value = phrase.meaning;
    els.heardSentence.value = phrase.heardSentence;
    els.mySentence.value = phrase.mySentence;
    els.source.value = phrase.source;
    els.tag.value = phrase.tag;
    els.formTitle.textContent = "ویرایش عبارت";
    els.saveButton.textContent = "ذخیره تغییرات";
    els.resetFormButton.classList.remove("hidden");
    document.querySelector(".more-fields").open = Boolean(
      phrase.heardSentence || phrase.mySentence || phrase.tag || phrase.source !== "work"
    );
    document.querySelector("#captureSection").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => els.expression.focus(), 250);
  }

  function deletePhrase(id) {
    const phrase = state.phrases.find((item) => item.id === id);
    if (!phrase) return;
    const confirmed = globalThis.confirm(`عبارت «${phrase.expression}» حذف شود؟`);
    if (!confirmed) return;
    state.phrases = state.phrases.filter((item) => item.id !== id);
    saveState();
    renderAll();
    refreshReviewQueue(false);
    showToast("عبارت حذف شد");
  }

  function setActiveTab(tabName) {
    els.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
    els.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tabName));
    if (tabName === "review") {
      reviewAllMode = false;
      refreshReviewQueue(true);
    }
  }

  function refreshReviewQueue(resetIndex = false) {
    const currentId = reviewQueue[reviewIndex]?.id;
    reviewQueue = reviewAllMode
      ? [...state.phrases].filter((phrase) => !phrase.inbox).sort(() => Math.random() - 0.5)
      : getDuePhrases();

    if (resetIndex) {
      reviewIndex = 0;
      reviewCompleted = 0;
      reviewSessionTotal = reviewQueue.length;
    } else if (currentId) {
      const newIndex = reviewQueue.findIndex((phrase) => phrase.id === currentId);
      reviewIndex = newIndex >= 0 ? newIndex : Math.min(reviewIndex, Math.max(0, reviewQueue.length - 1));
      reviewSessionTotal = Math.max(reviewSessionTotal, reviewCompleted + reviewQueue.length);
    } else {
      reviewIndex = Math.min(reviewIndex, Math.max(0, reviewQueue.length - 1));
      reviewSessionTotal = Math.max(reviewSessionTotal, reviewCompleted + reviewQueue.length);
    }

    renderReview();
  }

  function renderReview() {
    const current = reviewQueue[reviewIndex];
    const position = current ? reviewCompleted + 1 : reviewCompleted;
    els.reviewProgress.textContent = `${toPersianNumber(position)} از ${toPersianNumber(reviewSessionTotal)}`;

    if (!current) {
      els.reviewCard.classList.add("hidden");
      els.reviewEmpty.classList.remove("hidden");
      els.reviewAllButton.classList.toggle("hidden", state.phrases.filter((item) => !item.inbox).length === 0);
      if (reviewAllMode) {
        document.querySelector("#reviewEmpty h3").textContent = "مرور آزاد تمام شد";
        document.querySelector("#reviewEmpty p").textContent = "برای شروع دوباره روی مرور آزاد بزن.";
      } else {
        document.querySelector("#reviewEmpty h3").textContent = "مرور امروز تمام شد";
        document.querySelector("#reviewEmpty p").textContent = "عبارت‌های جدید یا موعددار اینجا نمایش داده می‌شوند.";
      }
      return;
    }

    els.reviewEmpty.classList.add("hidden");
    els.reviewCard.classList.remove("hidden");
    els.reviewSource.textContent = sourceLabels[current.source];
    els.reviewLevel.textContent = current.reviewCount
      ? `${toPersianNumber(current.reviewCount)} مرور • فاصله ${toPersianNumber(current.intervalDays)} روز`
      : "عبارت جدید";
    els.reviewExpression.textContent = current.expression;
    els.reviewMeaning.textContent = current.meaning || "معنی ثبت نشده";
    els.reviewHeard.textContent = current.heardSentence;
    els.reviewMine.textContent = current.mySentence;
    els.heardAnswerBlock.classList.toggle("hidden", !current.heardSentence);
    els.myAnswerBlock.classList.toggle("hidden", !current.mySentence);
    els.reviewAnswer.classList.add("hidden");
    els.revealButton.classList.remove("hidden");
  }

  function rateCurrent(rating) {
    const current = reviewQueue[reviewIndex];
    if (!current) return;
    const phrase = state.phrases.find((item) => item.id === current.id);
    if (!phrase) return;

    const now = Date.now();
    const previous = Math.max(phrase.intervalDays || 0, 0);
    let nextIntervalDays = previous;
    let dueAt = now;

    if (rating === "again") {
      nextIntervalDays = 0;
      dueAt = now + TEN_MINUTES_MS;
    } else if (rating === "hard") {
      nextIntervalDays = Math.max(1, Math.round(previous * 1.35) || 1);
      dueAt = now + nextIntervalDays * DAY_MS;
    } else if (rating === "good") {
      nextIntervalDays = previous === 0 ? 2 : Math.max(2, Math.round(previous * 2.15));
      dueAt = now + nextIntervalDays * DAY_MS;
    } else if (rating === "easy") {
      nextIntervalDays = previous === 0 ? 4 : Math.max(4, Math.round(previous * 3));
      dueAt = now + nextIntervalDays * DAY_MS;
    }

    phrase.intervalDays = nextIntervalDays;
    phrase.dueAt = dueAt;
    phrase.reviewCount += 1;
    phrase.lastReviewedAt = new Date(now).toISOString();
    phrase.updatedAt = new Date(now).toISOString();
    phrase.inbox = false;
    saveState();

    reviewCompleted += 1;
    if (reviewAllMode) {
      reviewQueue[reviewIndex] = { ...phrase };
      reviewIndex += 1;
    } else {
      reviewQueue.splice(reviewIndex, 1);
      if (reviewIndex >= reviewQueue.length) reviewIndex = Math.max(0, reviewQueue.length - 1);
    }
    renderStats();
    renderLibrary();
    renderReview();
  }

  function exportBackup() {
    const payload = {
      app: "Phrase Pocket",
      exportedAt: new Date().toISOString(),
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `phrase-pocket-backup-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("فایل بکاپ ساخته شد");
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = parsed.data || parsed;
      if (!incoming || !Array.isArray(incoming.phrases)) {
        throw new Error("Invalid backup format");
      }
      const normalized = incoming.phrases.map(normalizePhrase).filter((item) => item.expression);
      const confirmed = globalThis.confirm(
        `${toPersianNumber(normalized.length)} عبارت پیدا شد. اطلاعات فعلی با این بکاپ جایگزین شود؟`
      );
      if (!confirmed) return;
      state = {
        ...createEmptyState(),
        ...incoming,
        phrases: normalized,
        updatedAt: new Date().toISOString(),
      };
      saveState();
      reviewAllMode = false;
      resetForm();
      renderAll();
      refreshReviewQueue(true);
      showToast("بکاپ وارد شد");
    } catch (error) {
      console.error(error);
      showToast("فایل بکاپ معتبر نیست");
    } finally {
      els.importInput.value = "";
    }
  }

  function clearAll() {
    const confirmed = globalThis.confirm("همه عبارت‌ها و سابقه مرور برای همیشه پاک شود؟");
    if (!confirmed) return;
    state = createEmptyState();
    localStorage.removeItem(STORAGE_KEY);
    resetForm();
    reviewQueue = [];
    reviewIndex = 0;
    reviewAllMode = false;
    reviewCompleted = 0;
    reviewSessionTotal = 0;
    renderAll();
    renderReview();
    showToast("همه اطلاعات پاک شد");
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      els.offlineStatus.textContent = "این مرورگر Service Worker را پشتیبانی نمی‌کند.";
      return;
    }

    navigator.serviceWorker
      .register("./sw.js")
      .then(() => {
        els.offlineStatus.textContent = "حالت آفلاین فعال است؛ بعد از اولین باز شدن، برنامه بدون اینترنت هم اجرا می‌شود.";
      })
      .catch((error) => {
        console.error("Service worker registration failed", error);
        els.offlineStatus.textContent = "برای فعال شدن حالت آفلاین، برنامه باید از طریق HTTPS یا localhost باز شود.";
      });
  }

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    upsertPhrase(collectFormData(false));
  });

  els.saveInboxButton.addEventListener("click", () => {
    upsertPhrase(collectFormData(true));
  });

  els.resetFormButton.addEventListener("click", resetForm);
  els.searchInput.addEventListener("input", renderLibrary);
  els.filterSelect.addEventListener("change", renderLibrary);

  els.phraseList.addEventListener("click", (event) => {
    const card = event.target.closest(".phrase-card");
    if (!card) return;
    if (event.target.closest(".edit-phrase")) editPhrase(card.dataset.id);
    if (event.target.closest(".delete-phrase")) deletePhrase(card.dataset.id);
  });

  els.tabs.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  els.revealButton.addEventListener("click", () => {
    els.revealButton.classList.add("hidden");
    els.reviewAnswer.classList.remove("hidden");
  });

  els.ratingButtons.forEach((button) => {
    button.addEventListener("click", () => rateCurrent(button.dataset.rating));
  });

  els.reviewAllButton.addEventListener("click", () => {
    reviewAllMode = true;
    reviewIndex = 0;
    refreshReviewQueue(true);
  });

  els.exportButton.addEventListener("click", exportBackup);
  els.importInput.addEventListener("change", () => importBackup(els.importInput.files?.[0]));
  els.clearButton.addEventListener("click", clearAll);
  els.themeButton.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      state = loadState();
      renderAll();
    }
  });

  initTheme();
  renderAll();
  renderReview();
  registerServiceWorker();
})();
