/**
 * @file src/index.ts
 * @version 5
 * @description Точка входа в приложение dtrader-server
 * @changelog
 *   5 - Добавлены TickStore и OrderBookStore (2025-01-22)
 *   4 - Исправлены интервалы логирования и дублирование pong (2025-01-22)
 *   3 - Добавлен WebSocket клиент Gate.io (2025-01-22)
 *   2 - Рефакторинг: вынесена логика в модули (2025-01-22)
 *   1 - Интеграция EventBus и Logger (2025-01-22)
 *   0 - Первая версия: минимальный запуск с REST запросом баланса (2025-01-22)
 */

import { config } from "./config/env";
import { APP_NAME, APP_VERSION, EMOJI } from "./config/constants";
import { eventBus } from "./core/EventBus";
import { logger } from "./logger/Logger";
import { LogCategory } from "./logger/types";
import { GateioClient } from "./exchange/GateioClient";
import { GateioWebSocket } from "./exchange/GateioWebSocket";
import { TickStore } from "./data/TickStore";
import { OrderBookStore } from "./data/OrderBookStore";
import { Balance } from "./exchange/types";
import { isNonZeroBalance, formatBalance } from "./exchange/utils";

// Глобальные экземпляры для graceful shutdown
let gateioWS: GateioWebSocket | null = null;
let tickStore: TickStore | null = null;
let orderBookStore: OrderBookStore | null = null;

/**
 * Форматирование баланса для вывода в консоль
 *
 * @param balances - массив балансов
 */
function displayBalances(balances: Balance[]): void {
  console.log("\n" + "=".repeat(60));
  console.log(`${EMOJI.MONEY}  БАЛАНС НА GATE.IO`);
  console.log("=".repeat(60));

  // Фильтруем только ненулевые балансы
  const nonZeroBalances = balances.filter((b) =>
    isNonZeroBalance(b.available, b.locked)
  );

  if (nonZeroBalances.length === 0) {
    console.log("Нет средств на балансе");
  } else {
    // Выводим таблицу
    console.log("");
    console.log("Валюта       Доступно              Заблокировано");
    console.log("-".repeat(60));

    nonZeroBalances.forEach((balance) => {
      const currency = balance.currency.padEnd(12);
      const available = formatBalance(balance.available).padStart(20);
      const locked = formatBalance(balance.locked).padStart(20);

      console.log(`${currency} ${available} ${locked}`);
    });
  }

  console.log("=".repeat(60));
  console.log("");
}

/**
 * Обработка graceful shutdown
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(
      `Получен сигнал ${signal}, останавливаем систему...`,
      LogCategory.SYSTEM
    );

    // Эмитим событие остановки
    eventBus.emitSafe("system:shutdown");

    // Отключаемся от WebSocket
    if (gateioWS) {
      gateioWS.disconnect();
    }

    // Выводим статистику перед остановкой
    if (tickStore) {
      const stats = tickStore.getStats();
      logger.info(
        `📊 TickStore статистика: ${stats.totalCount} тиков получено, ` +
          `${stats.count} в памяти, средняя цена: ${stats.avgPrice.toFixed(2)}`,
        LogCategory.SYSTEM
      );
    }

    if (orderBookStore) {
      const updateCount = orderBookStore.getUpdateCount();
      logger.info(
        `📖 OrderBookStore статистика: ${updateCount} обновлений применено`,
        LogCategory.SYSTEM
      );
    }

    // Даём время на завершение асинхронных операций
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logger.info("Система остановлена", LogCategory.SYSTEM);

    process.exit(0);
  };

  // Обработка SIGINT (Ctrl+C)
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Обработка SIGTERM (kill)
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Обработка необработанных ошибок
  process.on("uncaughtException", (error) => {
    logger.error("Необработанное исключение", LogCategory.SYSTEM, error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Необработанное отклонение Promise", LogCategory.SYSTEM, {
      reason,
    });
    process.exit(1);
  });
}

/**
 * Подписка на события тиков (для демонстрации)
 */
function setupTickListener(): void {
  let tickCount = 0;

  eventBus.on("data:tick:received", (tick: any) => {
    tickCount++;

    // Выводим каждый 5-й тик
    if (tickCount % 5 === 0) {
      logger.info(
        `📊 Тик #${tickCount}: ${tick.symbol} @ ${
          tick.price
        } USDT (изменение 24ч: ${tick.change24h.toFixed(2)}%)`,
        LogCategory.INTERNAL
      );
    }

    // Каждые 50 тиков выводим статистику TickStore
    if (tickCount % 50 === 0 && tickStore) {
      const stats = tickStore.getStats();
      logger.info(
        `📊 TickStore: ${stats.count} тиков | ` +
          `Средняя цена: ${stats.avgPrice.toFixed(2)} | ` +
          `Min: ${stats.minPrice.toFixed(2)} | Max: ${stats.maxPrice.toFixed(
            2
          )}`,
        LogCategory.INTERNAL
      );
    }
  });
}

/**
 * Подписка на события orderbook (для демонстрации)
 */
function setupOrderBookListener(): void {
  let updateCount = 0;

  eventBus.on("data:orderbook:updated", (data: any) => {
    updateCount++;

    // Выводим каждое 20-е обновление
    if (updateCount % 20 === 0 && orderBookStore) {
      const stats = orderBookStore.getStats();

      logger.info(
        `📖 OrderBook #${updateCount}: ` +
          `bid ${stats.bestBid.toFixed(2)} | ask ${stats.bestAsk.toFixed(
            2
          )} | ` +
          `spread ${stats.spread.toFixed(2)} (${stats.spreadPercent.toFixed(
            3
          )}%) | ` +
          `давление: ${stats.bidPercent.toFixed(
            1
          )}% / ${stats.askPercent.toFixed(1)}%`,
        LogCategory.INTERNAL
      );
    }
  });
}

/**
 * Главная функция приложения
 */
async function main(): Promise<void> {
  try {
    // Настраиваем graceful shutdown
    setupGracefulShutdown();

    // Выводим приветствие
    console.log("\n" + "=".repeat(60));
    console.log(`${EMOJI.ROCKET}  ${APP_NAME} v${APP_VERSION}`);
    console.log("=".repeat(60));
    console.log("");

    // Эмитим событие запуска
    eventBus.emitSafe("system:startup");

    // ==================== REST API ====================

    // Создаём REST клиент Gate.io
    const gateio = new GateioClient({
      apiKey: config.gateio.apiKey,
      apiSecret: config.gateio.apiSecret,
      apiUrl: config.gateio.apiUrl,
    });

    // Получаем баланс
    const balances = await gateio.getBalance();
    displayBalances(balances);

    // Получаем тикер
    const ticker = await gateio.getTicker(config.trading.symbol);
    console.log(
      `💱 ${config.trading.symbol}: ${ticker.last} USDT (${ticker.change_percentage}%)\n`
    );

    // ==================== DATA STORES ====================

    console.log("=".repeat(60));
    console.log("💾 ИНИЦИАЛИЗАЦИЯ DATA STORES");
    console.log("=".repeat(60));
    console.log("");

    // Создаём TickStore
    tickStore = new TickStore(config.trading.symbol);
    logger.success(
      `✅ TickStore создан для ${config.trading.symbol}`,
      LogCategory.SYSTEM
    );

    // Создаём OrderBookStore
    orderBookStore = new OrderBookStore(
      config.trading.symbol,
      gateio,
      config.trading.orderBookDepth
    );
    logger.success(
      `✅ OrderBookStore создан для ${config.trading.symbol}`,
      LogCategory.SYSTEM
    );

    // Синхронизируем OrderBook через REST API
    await orderBookStore.sync();

    console.log("");

    // ==================== WEBSOCKET ====================

    console.log("=".repeat(60));
    console.log("🔌 ПОДКЛЮЧЕНИЕ К GATE.IO WEBSOCKET");
    console.log("=".repeat(60));
    console.log("");

    // Создаём WebSocket клиент
    gateioWS = new GateioWebSocket({
      wsUrl: config.gateio.wsUrl,
      currencyPair: config.trading.symbol,
    });

    // Подключаемся
    await gateioWS.connect();

    // Подписываемся на каналы
    await gateioWS.subscribe();

    // Настраиваем listeners для демонстрации
    setupTickListener();
    setupOrderBookListener();

    console.log("\n" + "=".repeat(60));
    console.log("✅ СИСТЕМА ЗАПУЩЕНА И РАБОТАЕТ");
    console.log("=".repeat(60));
    console.log("");
    console.log("📊 Получаем real-time данные с Gate.io:");
    console.log("   • Тики (каждый 5-й выводится) → сохраняются в TickStore");
    console.log(
      "   • OrderBook (каждый 20-й выводится) → синхронизируется в OrderBookStore"
    );
    console.log("   • Ping-Pong каждые 15 секунд");
    console.log("");
    console.log("💾 Данные в памяти:");
    console.log("   • TickStore: последние 1000 тиков");
    console.log("   • OrderBookStore: полный стакан (синхронизирован)");
    console.log("");
    console.log("💡 Нажмите Ctrl+C для остановки");
    console.log("");

    // Эмитим событие готовности
    eventBus.emitSafe("system:ready");

    logger.success("Приложение успешно запущено!", LogCategory.SYSTEM);
    logger.info(
      "Версия с Data Layer (TickStore + OrderBookStore)",
      LogCategory.SYSTEM
    );

    // Держим процесс живым
    // (WebSocket будет работать в фоне)
  } catch (error: any) {
    logger.error("Критическая ошибка при запуске", LogCategory.SYSTEM, {
      message: error.message,
    });

    // Эмитим событие ошибки
    eventBus.emitSafe("system:error", { error: error.message });

    process.exit(1);
  }
}

// Запускаем приложение
main();
