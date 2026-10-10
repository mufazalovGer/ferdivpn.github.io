(() => {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || "";
  const notice = document.getElementById("notice");
  const loading = document.getElementById("loading");
  const cabinet = document.getElementById("cabinet");
  let cabinetData;

  telegram?.ready();
  telegram?.expand();

  function showNotice(text, isError = false) {
    notice.textContent = text;
    notice.classList.toggle("error", isError);
    notice.hidden = false;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData,
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Не удалось выполнить запрос.");
      error.data = data;
      throw error;
    }
    return data;
  }

  function renderTransactions(items) {
    const list = document.getElementById("transactions");
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Операций пока нет.";
      list.append(empty);
      return;
    }

    for (const item of [...items].reverse()) {
      const row = document.createElement("div");
      row.className = "transaction";
      const label = document.createElement("span");
      label.className = "transaction-label";
      label.textContent = item.reason || "Операция";
      const amount = document.createElement("span");
      const credited = item.kind === "credit";
      amount.className = `transaction-amount ${credited ? "positive" : "negative"}`;
      amount.textContent = `${credited ? "+" : "−"}${item.amount} ₽`;
      row.append(label, amount);
      list.append(row);
    }
  }

  function renderSubscription(subscription) {
    const state = document.getElementById("subscription-state");
    const empty = document.getElementById("subscription-empty");
    const details = document.getElementById("subscription-details");
    if (!subscription) {
      state.textContent = "Нет подписки";
      state.classList.remove("active");
      empty.hidden = false;
      details.hidden = true;
      return;
    }

    const active = Number(subscription.expires_at) * 1000 > Date.now();
    state.textContent = active ? "Активна" : "Срок истёк";
    state.classList.toggle("active", active);
    empty.hidden = true;
    details.hidden = false;
    document.getElementById("subscription-tariff").textContent = subscription.tariff;
    document.getElementById("subscription-expiry").textContent =
      subscription.expires_at
        ? `${active ? "Действует до" : "Истекла"} ${new Date(Number(subscription.expires_at) * 1000).toLocaleString("ru-RU")}`
        : "Срок действия уточняйте в поддержке.";
    document.getElementById("vpn-key").textContent = subscription.vpn_key;
  }

  function renderTariffs(tariffs) {
    const list = document.getElementById("tariffs");
    list.replaceChildren();
    for (const tariff of tariffs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tariff-button";
      const info = document.createElement("span");
      const name = document.createElement("span");
      name.className = "tariff-name";
      name.textContent = tariff.name;
      const meta = document.createElement("span");
      meta.className = "tariff-meta";
      meta.textContent = `${tariff.days} дней · ${tariff.devices} устройств`;
      info.append(name, document.createElement("br"), meta);
      const price = document.createElement("span");
      price.className = "tariff-price";
      price.textContent = `${tariff.price} ₽`;
      button.append(info, price);
      button.addEventListener("click", () => buyTariff(tariff.id, button));
      list.append(button);
    }
  }

  function render(data) {
    cabinetData = data;
    document.getElementById("greeting").textContent =
      data.user.first_name ? `Привет, ${data.user.first_name}` : "Ваш баланс";
    document.getElementById("balance").textContent = `${data.balance} ₽`;
    renderSubscription(data.subscription);
    renderTariffs(data.tariffs);
    renderTransactions(data.transactions);
    loading.hidden = true;
    cabinet.hidden = false;
  }

  async function refresh() {
    render(await api("/api/cabinet"));
  }

  async function createTopup(amount, button) {
    button.disabled = true;
    try {
      const result = await api("/api/topups", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      showNotice(`Ссылка на пополнение ${amount} ₽ создана. Откройте её для оплаты.`);
      if (telegram?.openLink) {
        telegram.openLink(result.payment_url);
      } else {
        window.open(result.payment_url, "_blank", "noopener");
      }
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function buyTariff(tariffId, button) {
    button.disabled = true;
    try {
      const result = await api("/api/purchases", {
        method: "POST",
        body: JSON.stringify({ tariff_id: tariffId }),
      });
      showNotice(`Тариф «${result.tariff}» подключён. Баланс: ${result.balance} ₽.`);
      telegram?.HapticFeedback?.notificationOccurred("success");
      await refresh();
    } catch (error) {
      showNotice(error.message, true);
      telegram?.HapticFeedback?.notificationOccurred("error");
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll(".amount-button").forEach((button) => {
    button.addEventListener("click", () => createTopup(Number(button.dataset.amount), button));
  });

  document.getElementById("topup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const amount = Number(new FormData(form).get("amount"));
    const submit = form.querySelector("button[type=submit]");
    if (!Number.isInteger(amount) || amount < 50 || amount > 50000) {
      showNotice("Введите целую сумму от 50 до 50 000 ₽.", true);
      return;
    }
    createTopup(amount, submit);
  });

  document.getElementById("copy-key").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById("vpn-key").textContent);
      showNotice("VPN-ключ скопирован.");
      telegram?.HapticFeedback?.notificationOccurred("success");
    } catch {
      showNotice("Не удалось скопировать ключ. Выделите его и скопируйте вручную.", true);
    }
  });

  if (!initData) {
    loading.hidden = true;
    showNotice("Откройте кабинет через кнопку в Telegram-боте.", true);
  } else {
    refresh().catch((error) => {
      loading.hidden = true;
      showNotice(error.message, true);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && initData) {
      refresh().catch((error) => showNotice(error.message, true));
    }
  });
})();
