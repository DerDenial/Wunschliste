"use strict";

const grid = document.querySelector("#wish-grid");
const wishTemplate = document.querySelector("#wish-template");
const wishCount = document.querySelector("#wish-count");
const activeFilters = document.querySelector("#active-filters");
const listState = document.querySelector("#list-state");
const listMessage = document.querySelector("#list-message");
const retry = document.querySelector("#retry");

const menuTrigger = document.querySelector("#menu-trigger");
const menuFilterCount = document.querySelector("#menu-filter-count");
const controlsPanel = document.querySelector("#controls-panel");
const controlViews = controlsPanel.querySelectorAll("[data-control-view]");
const sortTrigger = document.querySelector("#sort-trigger");
const sortOptions = [...document.querySelectorAll(".sort-option")];

const filterTrigger = document.querySelector("#filter-trigger");
const filterCount = document.querySelector("#filter-count");
const categoryOptions = document.querySelector("#category-options");
const priceFilter = document.querySelector("#price-filter");
const priceInput = document.querySelector("#max-price");
const priceValue = document.querySelector("#price-value");
const reset = document.querySelector("#reset-filters");

const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
const numberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const selectedCategories = new Set();

let wishes = [];
let sorting = "original";
let maximumPrice = null;
let priceCeiling = 0;
let priceCurrency = "";

function priceLabel(amount, currency) {
  if (/^[A-Z]{3}$/i.test(currency)) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      minimumFractionDigits: 0
    }).format(amount);
  }

  return currency ? `${numberFormat.format(amount)} ${currency}` : numberFormat.format(amount);
}

function webUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, document.baseURI);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function makeIcon(id) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  const use = document.createElementNS(svgNamespace, "use");

  icon.classList.add("icon");
  icon.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `#${id}`);
  icon.append(use);
  return icon;
}

function makeCard(wish, index) {
  const card = wishTemplate.content.firstElementChild.cloneNode(true);
  const category = card.querySelector(".wish-category");
  const subtitle = card.querySelector(".wish-subtitle");
  const price = card.querySelector(".wish-price");
  const image = card.querySelector(".wish-image");
  const imageFallback = card.querySelector(".image-fallback");
  const link = card.querySelector(".wish-link");

  card.querySelector(".wish-name").textContent = wish.name;
  category.textContent = wish.category;
  category.hidden = !wish.category;
  subtitle.textContent = wish.subtitle;
  subtitle.hidden = !wish.subtitle;
  price.textContent = wish.price === null ? "" : priceLabel(wish.price, wish.currency);
  price.hidden = wish.price === null;

  function showImageFallback() {
    image.hidden = true;
    imageFallback.hidden = false;
  }

  const imageUrl = webUrl(wish.image);
  if (imageUrl) {
    image.loading = index < 4 ? "eager" : "lazy";
    image.addEventListener("error", showImageFallback, { once: true });
    image.src = imageUrl;
  } else {
    showImageFallback();
  }

  const shopUrl = webUrl(wish.url);
  if (shopUrl) {
    link.href = shopUrl;
    link.setAttribute("aria-label", `${wish.name} im Shop öffnen (neuer Tab)`);
  } else {
    link.hidden = true;
    card.querySelector(".wish-notch").hidden = true;
  }

  return card;
}

function readWishes(data) {
  if (!Array.isArray(data)) throw new TypeError("wishes.json muss eine JSON-Liste enthalten.");

  return data.map((item, index) => {
    if (typeof item?.name !== "string" || !item.name.trim()) {
      throw new TypeError(`Eintrag ${index + 1} in wishes.json benötigt einen Namen.`);
    }

    const wish = {
      name: item.name.trim(),
      subtitle: typeof item.subtitle === "string" ? item.subtitle.trim() : "",
      category: typeof item.category === "string" ? item.category.trim() : "",
      price: Number.isFinite(item.price) && item.price >= 0 ? item.price : null,
      currency: typeof item.currency === "string" ? item.currency.trim() : "",
      image: typeof item.image === "string" ? item.image.trim() : "",
      url: typeof item.url === "string" ? item.url.trim() : ""
    };

    wish.card = makeCard(wish, index);
    return wish;
  });
}

function configureFilters() {
  const categories = [...new Set(wishes.map(wish => wish.category).filter(Boolean))];
  categories.sort(collator.compare);

  categoryOptions.replaceChildren();
  categoryOptions.closest("fieldset").hidden = categories.length === 0;
  for (const category of categories) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const name = document.createElement("span");

    label.className = "category-option";
    input.type = "checkbox";
    input.value = category;
    name.textContent = category;
    label.append(input, name);
    categoryOptions.append(label);
  }

  const pricedWishes = wishes.filter(wish => wish.price !== null);
  const currencies = new Set(pricedWishes.map(wish => wish.currency));
  priceCurrency = currencies.size === 1 ? pricedWishes[0].currency : "";
  priceCeiling = pricedWishes.reduce((maximum, wish) => Math.max(maximum, wish.price), 0);
  priceInput.max = String(priceCeiling);
  priceInput.step = pricedWishes.some(wish => !Number.isInteger(wish.price)) ? "0.01" : "1";
  priceInput.value = String(priceCeiling);
  priceFilter.hidden = priceCeiling === 0;
  document.querySelector("#price-min").textContent = priceLabel(0, priceCurrency);
  document.querySelector("#price-max").textContent = priceLabel(priceCeiling, priceCurrency);
  filterTrigger.disabled = categories.length === 0 && priceCeiling === 0;
}

function compareWishes(a, b) {
  if (sorting === "name-asc") return collator.compare(a.name, b.name);
  if (sorting === "name-desc") return collator.compare(b.name, a.name);
  if (a.price === null) return b.price === null ? 0 : 1;
  if (b.price === null) return -1;
  return sorting === "price-asc" ? a.price - b.price : b.price - a.price;
}

function render() {
  const filters = [...selectedCategories].sort(collator.compare);
  const priceLimit = maximumPrice === null ? "" : priceLabel(maximumPrice, priceCurrency);
  if (priceLimit) filters.push(`bis ${priceLimit}`);

  priceValue.textContent = priceLimit || "Alle Preise";
  priceInput.setAttribute("aria-valuetext", priceValue.textContent);
  activeFilters.textContent = filters.join(" · ");
  activeFilters.hidden = filters.length === 0;
  filterCount.textContent = String(filters.length);
  filterCount.hidden = filters.length === 0;
  menuFilterCount.textContent = filterCount.textContent;
  menuFilterCount.hidden = filterCount.hidden;
  const filterLabel = filters.length === 1 ? "1 aktiver Filter" : `${filters.length} aktive Filter`;
  filterTrigger.setAttribute("aria-label", filters.length
    ? `Filtern (${filterLabel})`
    : "Filtern");
  menuTrigger.setAttribute("aria-label", filters.length
    ? `Wunschlisten-Menü (${filterLabel})`
    : "Wunschlisten-Menü");

  const visible = wishes.filter(wish => {
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(wish.category);
    const matchesPrice = maximumPrice === null || (wish.price !== null && wish.price <= maximumPrice);
    return matchesCategory && matchesPrice;
  });

  if (sorting !== "original") visible.sort(compareWishes);
  grid.replaceChildren(...visible.map(wish => wish.card));

  wishCount.textContent = filters.length
    ? `${visible.length} von ${wishes.length} ${wishes.length === 1 ? "Wunsch" : "Wünschen"}`
    : `${wishes.length} ${wishes.length === 1 ? "Wunsch" : "Wünsche"}`;
  listState.hidden = visible.length > 0;
  listMessage.textContent = wishes.length
    ? "Keine Wünsche passen zu diesen Filtern."
    : "Die Wunschliste ist leer.";
}

function showControlView(view, focusTarget) {
  controlsPanel.dataset.view = view;
  for (const section of controlViews) {
    section.hidden = section.dataset.controlView !== view;
  }
  controlsPanel.scrollTop = 0;
  focusTarget?.focus({ preventScroll: true });
}

controlsPanel.addEventListener("beforetoggle", event => {
  if (event.newState === "open") showControlView("menu");
});

controlsPanel.addEventListener("toggle", event => {
  if (event.newState === "open" && controlsPanel.dataset.view === "menu") {
    (sortTrigger.disabled ? filterTrigger : sortTrigger).focus({ preventScroll: true });
  }
});

sortTrigger.addEventListener("click", () => {
  showControlView("sort", controlsPanel.querySelector('[data-sort][aria-pressed="true"]'));
});

filterTrigger.addEventListener("click", () => {
  showControlView("filter", document.querySelector("#filter-title"));
});

document.querySelector("#sort-back").addEventListener("click", () => showControlView("menu", sortTrigger));
document.querySelector("#filter-back").addEventListener("click", () => showControlView("menu", filterTrigger));

for (const option of sortOptions) {
  option.append(makeIcon("icon-check"));
  option.addEventListener("click", () => {
    sorting = option.dataset.sort;
    for (const button of sortOptions) {
      button.setAttribute("aria-pressed", String(button === option));
    }
    render();
    controlsPanel.hidePopover();
    menuTrigger.focus({ preventScroll: true });
  });
}

categoryOptions.addEventListener("change", event => {
  const input = event.target;
  if (input.checked) {
    selectedCategories.add(input.value);
  } else {
    selectedCategories.delete(input.value);
  }
  render();
});

priceInput.addEventListener("input", () => {
  maximumPrice = priceInput.valueAsNumber < priceCeiling ? priceInput.valueAsNumber : null;
  render();
});

reset.addEventListener("click", () => {
  selectedCategories.clear();
  maximumPrice = null;
  priceInput.value = String(priceCeiling);
  for (const input of categoryOptions.querySelectorAll("input")) input.checked = false;
  render();
});

async function loadWishes() {
  grid.setAttribute("aria-busy", "true");
  listState.hidden = false;
  listMessage.textContent = "Wünsche werden geladen …";
  retry.hidden = true;

  try {
    const response = await fetch("./wishes.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    wishes = readWishes(await response.json());
    sortTrigger.disabled = wishes.length < 2;
    configureFilters();
    menuTrigger.disabled = sortTrigger.disabled && filterTrigger.disabled;
    render();
  } catch (error) {
    listMessage.textContent = location.protocol === "file:"
      ? "Öffne diese Seite über einen lokalen Webserver, um wishes.json zu laden."
      : "Die Wunschliste konnte nicht geladen werden. Prüfe die Datei wishes.json.";
    retry.hidden = false;
    console.error("Fehler beim Laden von wishes.json:", error);
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}

retry.addEventListener("click", loadWishes);
loadWishes();

