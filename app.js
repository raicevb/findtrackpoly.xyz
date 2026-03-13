const API_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&sparkline=true&price_change_percentage=24h,7d";

const FALLBACK_DATA = [
  {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "btc",
    current_price: 68325,
    price_change_percentage_24h: 1.94,
    price_change_percentage_7d_in_currency: 5.81,
    total_volume: 32400000000,
    market_cap: 1352000000000,
    sparkline_in_7d: { price: [65800, 66100, 66550, 66980, 67010, 67550, 68325] },
  },
  {
    id: "ethereum",
    name: "Ethereum",
    symbol: "eth",
    current_price: 3564,
    price_change_percentage_24h: 0.88,
    price_change_percentage_7d_in_currency: 4.62,
    total_volume: 16800000000,
    market_cap: 428000000000,
    sparkline_in_7d: { price: [3380, 3410, 3450, 3488, 3504, 3522, 3564] },
  },
  {
    id: "solana",
    name: "Solana",
    symbol: "sol",
    current_price: 142.8,
    price_change_percentage_24h: -1.2,
    price_change_percentage_7d_in_currency: 2.91,
    total_volume: 3120000000,
    market_cap: 64200000000,
    sparkline_in_7d: { price: [137.1, 138.8, 140.2, 141.9, 143.1, 144.4, 142.8] },
  },
];

const REFRESH_MS = 60_000;

const coinGrid = document.querySelector("#coinGrid");
const dominanceBars = document.querySelector("#dominanceBars");
const statusBanner = document.querySelector("#statusBanner");
const refreshButton = document.querySelector("#refreshButton");

const marketSide = document.querySelector("#marketSide");
const dominanceLeader = document.querySelector("#dominanceLeader");
const lastUpdated = document.querySelector("#lastUpdated");
const totalMarketCap = document.querySelector("#totalMarketCap");
const averageProbability = document.querySelector("#averageProbability");
const strongestAsset = document.querySelector("#strongestAsset");
const weakestAsset = document.querySelector("#weakestAsset");

const cardTemplate = document.querySelector("#coinCardTemplate");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getDirectionLabel(change24h, bullishProbability) {
  if (change24h > 0.4 && bullishProbability >= 55) {
    return { text: "Uptrend", className: "up" };
  }

  if (change24h < -0.4 && bullishProbability <= 45) {
    return { text: "Downtrend", className: "down" };
  }

  return { text: "Neutral", className: "neutral" };
}

function getBiasLabel(probability) {
  if (probability >= 68) {
    return "Bullish Bias";
  }

  if (probability <= 32) {
    return "Bearish Bias";
  }

  return "Balanced Bias";
}

function calculateBullishProbability(coin) {
  const prices = coin.sparkline_in_7d?.price ?? [];
  const firstPrice = prices[0] || coin.current_price;
  const lastPrice = prices[prices.length - 1] || coin.current_price;
  const minPrice = Math.min(...prices, coin.current_price);
  const maxPrice = Math.max(...prices, coin.current_price);
  const change24h = coin.price_change_percentage_24h ?? 0;
  const change7d = coin.price_change_percentage_7d_in_currency ?? 0;
  const volumeRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;
  const shortMomentum = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const pricePosition = maxPrice === minPrice ? 0.5 : (coin.current_price - minPrice) / (maxPrice - minPrice);

  let score = 50;
  score += clamp(change24h * 2.2, -18, 18);
  score += clamp(change7d * 1.1, -18, 18);
  score += clamp(shortMomentum * 1.1, -14, 14);
  score += clamp((pricePosition - 0.5) * 26, -13, 13);
  score += clamp((volumeRatio - 0.04) * 220, -10, 10);

  return Math.round(clamp(score, 5, 95));
}

function buildDerivedMarketData(rawCoins) {
  if (!Array.isArray(rawCoins) || rawCoins.length === 0) {
    throw new Error("No market data returned for the tracked assets.");
  }

  const totalCap = rawCoins.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);

  const coins = rawCoins.map((coin) => {
    const bullishProbability = calculateBullishProbability(coin);
    const dominance = totalCap ? (coin.market_cap / totalCap) * 100 : 0;
    const direction = getDirectionLabel(
      coin.price_change_percentage_24h ?? 0,
      bullishProbability,
    );

    return {
      ...coin,
      bullishProbability,
      bearishProbability: 100 - bullishProbability,
      dominance,
      direction,
      biasLabel: getBiasLabel(bullishProbability),
    };
  });

  const leader = coins.reduce((best, coin) => (coin.dominance > best.dominance ? coin : best), coins[0]);
  const strongest = coins.reduce(
    (best, coin) => (coin.bullishProbability > best.bullishProbability ? coin : best),
    coins[0],
  );
  const weakest = coins.reduce(
    (worst, coin) => (coin.bullishProbability < worst.bullishProbability ? coin : worst),
    coins[0],
  );
  const averageBullish = Math.round(
    coins.reduce((sum, coin) => sum + coin.bullishProbability, 0) / coins.length,
  );

  let boardSide = "Balanced";
  if (averageBullish >= 58) {
    boardSide = "Bullish";
  } else if (averageBullish <= 42) {
    boardSide = "Bearish";
  }

  return {
    coins,
    totalCap,
    averageBullish,
    leader,
    strongest,
    weakest,
    boardSide,
  };
}

function renderCoins(coins) {
  coinGrid.textContent = "";

  for (const coin of coins) {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".coin-card");
    const change24h = coin.price_change_percentage_24h ?? 0;
    const weekly = coin.price_change_percentage_7d_in_currency ?? 0;

    fragment.querySelector(".coin-name").textContent = coin.name;
    fragment.querySelector(".coin-symbol").textContent = coin.symbol.toUpperCase();

    const badge = fragment.querySelector(".direction-badge");
    badge.textContent = coin.direction.text;
    badge.classList.add(coin.direction.className);

    fragment.querySelector(".coin-price").textContent = formatCurrency(coin.current_price);

    const coinChange = fragment.querySelector(".coin-change");
    coinChange.textContent = formatPercent(change24h);
    coinChange.classList.add(change24h >= 0 ? "positive" : "negative");

    fragment.querySelector(".bullish-probability").textContent = `${coin.bullishProbability}%`;

    const fill = fragment.querySelector(".probability-fill");
    fill.style.width = `${coin.bullishProbability}%`;

    fragment.querySelector(".bias-label").textContent = coin.biasLabel;
    fragment.querySelector(".bearish-probability").textContent = `Bearish ${coin.bearishProbability}%`;

    const weeklyChange = fragment.querySelector(".weekly-change");
    weeklyChange.textContent = formatPercent(weekly);
    weeklyChange.classList.add(weekly >= 0 ? "positive" : "negative");

    fragment.querySelector(".coin-volume").textContent = formatCompactCurrency(coin.total_volume);
    fragment.querySelector(".coin-market-cap").textContent = formatCompactCurrency(coin.market_cap);
    fragment.querySelector(".coin-dominance").textContent = `${coin.dominance.toFixed(2)}%`;

    card.dataset.coin = coin.id;
    coinGrid.appendChild(fragment);
  }
}

function renderDominance(coins) {
  dominanceBars.textContent = "";

  const fills = {
    bitcoin: "linear-gradient(90deg, #f7931a, #ffd166)",
    ethereum: "linear-gradient(90deg, #627eea, #9fb2ff)",
    solana: "linear-gradient(90deg, #14f195, #00c2ff)",
  };

  for (const coin of coins) {
    const wrapper = document.createElement("div");
    wrapper.className = "dominance-item";

    const label = document.createElement("div");
    label.className = "dominance-label";

    const name = document.createElement("strong");
    name.textContent = coin.name;

    const value = document.createElement("span");
    value.textContent = `${coin.dominance.toFixed(2)}%`;

    label.append(name, value);

    const track = document.createElement("div");
    track.className = "dominance-track";

    const fill = document.createElement("div");
    fill.className = "dominance-fill";
    fill.style.width = `${coin.dominance}%`;
    fill.style.background = fills[coin.id] || "linear-gradient(90deg, #78b7ff, #35d28b)";

    track.appendChild(fill);
    wrapper.append(label, track);
    dominanceBars.appendChild(wrapper);
  }
}

function renderSummary(summary) {
  marketSide.textContent = `${summary.boardSide} (${summary.averageBullish}%)`;
  dominanceLeader.textContent = `${summary.leader.name} ${summary.leader.dominance.toFixed(2)}%`;
  totalMarketCap.textContent = formatCompactCurrency(summary.totalCap);
  averageProbability.textContent = `${summary.averageBullish}% bullish`;
  strongestAsset.textContent = `${summary.strongest.name} ${summary.strongest.bullishProbability}%`;
  weakestAsset.textContent = `${summary.weakest.name} ${summary.weakest.bullishProbability}%`;
}

function setStatus(message = "", isError = false) {
  if (!message) {
    statusBanner.hidden = true;
    statusBanner.textContent = "";
    return;
  }

  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.style.borderColor = isError
    ? "rgba(255, 107, 122, 0.28)"
    : "rgba(120, 183, 255, 0.24)";
  statusBanner.style.background = isError
    ? "rgba(116, 13, 31, 0.3)"
    : "rgba(14, 50, 92, 0.3)";
}

async function fetchMarketData() {
  const response = await fetch(API_URL, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API responded with status ${response.status}`);
  }

  return response.json();
}

async function loadDashboard() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";

  try {
    setStatus("");
    const marketData = await fetchMarketData();
    const summary = buildDerivedMarketData(marketData);

    renderCoins(summary.coins);
    renderDominance(summary.coins);
    renderSummary(summary);
    lastUpdated.textContent = `Last updated: ${new Date().toLocaleString()}`;
  } catch (error) {
    const summary = buildDerivedMarketData(FALLBACK_DATA);
    renderCoins(summary.coins);
    renderDominance(summary.coins);
    renderSummary(summary);
    lastUpdated.textContent = `Showing fallback data: ${new Date().toLocaleString()}`;
    setStatus(
      `Live data request failed. Fallback values are shown instead. Reason: ${error.message}`,
      true,
    );
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh Data";
  }
}

refreshButton.addEventListener("click", () => {
  loadDashboard();
});

loadDashboard();
window.setInterval(loadDashboard, REFRESH_MS);
