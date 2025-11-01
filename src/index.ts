// ============================================================================
// FILE: src/index.ts - ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ
// ============================================================================

import { config } from "./config/env";
import { eventBus } from "./core/EventBus";
import { logger } from "./logger/Logger";
import { LogCategory } from "./logger/types";

// Exchange
import { GateioClient } from "./exchange/GateioClient";
import { GateioWebSocket } from "./exchange/GateioWebSocket";

// Data Layer
import { tickStore } from "./data/TickStore";
import { OrderBookStore } from "./data/OrderBookStore"; // Импорт КЛАССА, не экземпляра!
import { candleStore } from "./data/CandleStore";
import { candleBuilder } from "./data/CandleBuilder";

// Types
import type { Candle } from "./data/types";
import { TIMEFRAME_MS } from "./data/types";

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ КЛИЕНТОВ
// ============================================================================

const gateioClient = new GateioClient({
  apiKey: config.gateio.apiKey,
  apiSecret: config.gateio.apiSecret,
  apiUrl: config.gateio.apiUrl,
});

const gateioWebSocket = new GateioWebSocket({
  wsUrl: config.gateio.wsUrl,
  currencyPair: config.trading.symbols[0],
  pingInterval: 15000,
  pongTimeout: 30000,
  maxReconnectAttempts: 10,
});

// OrderBookStore требует gateioClient, создаём после инициализации
const orderBookStore = new OrderBookStore(
  config.trading.symbols[0],
  gateioClient,
  config.trading.orderBookDepth
);

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ИСТОРИЧЕСКИХ ДАННЫХ СВЕЧЕЙ
// ============================================================================

async function initializeCandleData(): Promise<void> {
  logger.info("📊 Загрузка исторических свечей...", LogCategory.SYSTEM);

  try {
    // 1. Получаем последние 500 свечей 1m от Gate.io
    const rawCandles = await gateioClient.getCandles({
      currencyPair: config.trading.symbols[0],
      interval: "1m",
      limit: 500,
    });

    logger.info(
      `✅ Получено ${rawCandles.length} свечей 1m от Gate.io`,
      LogCategory.SYSTEM
    );

    // 2. Добавляем в CandleStore (rawCandles уже тип Candle[])
    rawCandles.forEach((candle) => {
      candleStore.add("1m", candle);
    });

    // 3. Формируем 6m свечи из истории
    const all1m = candleStore.getAll("1m");
    let count6m = 0;

    for (let i = 0; i <= all1m.length - 6; i += 6) {
      const group = all1m.slice(i, i + 6);

      // Проверяем, что все 6 свечей последовательные
      let isSequential = true;
      for (let j = 1; j < group.length; j++) {
        const expected = group[j - 1].timestamp + TIMEFRAME_MS["1m"];
        if (group[j].timestamp !== expected) {
          isSequential = false;
          break;
        }
      }

      if (isSequential && group.length === 6) {
        const candle6m: Candle = {
          timestamp: group[0].timestamp,
          open: group[0].open,
          close: group[5].close,
          high: Math.max(...group.map((c) => c.high)),
          low: Math.min(...group.map((c) => c.low)),
          volume: group.reduce((sum, c) => sum + c.volume, 0),
          quoteVolume: group.reduce((sum, c) => sum + c.quoteVolume, 0),
        };

        candleStore.add("6m", candle6m);
        count6m++;
      }
    }

    logger.info(
      `✅ Сформировано ${count6m} свечей 6m из истории`,
      LogCategory.SYSTEM
    );

    // 4. Формируем 24m свечи из 6m
    const all6m = candleStore.getAll("6m");
    let count24m = 0;

    for (let i = 0; i <= all6m.length - 4; i += 4) {
      const group = all6m.slice(i, i + 4);

      // Проверяем последовательность
      let isSequential = true;
      for (let j = 1; j < group.length; j++) {
        const expected = group[j - 1].timestamp + TIMEFRAME_MS["6m"];
        if (group[j].timestamp !== expected) {
          isSequential = false;
          break;
        }
      }

      if (isSequential && group.length === 4) {
        const candle24m: Candle = {
          timestamp: group[0].timestamp,
          open: group[0].open,
          close: group[3].close,
          high: Math.max(...group.map((c) => c.high)),
          low: Math.min(...group.map((c) => c.low)),
          volume: group.reduce((sum, c) => sum + c.volume, 0),
          quoteVolume: group.reduce((sum, c) => sum + c.quoteVolume, 0),
        };

        candleStore.add("24m", candle24m);
        count24m++;
      }
    }

    logger.info(
      `✅ Сформировано ${count24m} свечей 24m из истории`,
      LogCategory.SYSTEM
    );

    // 5. Инициализируем буферы CandleBuilder из неполных агрегаций
    candleBuilder.initializeFromHistory();

    // 6. Выводим статистику
    const stats1m = candleStore.getStats("1m");
    const stats6m = candleStore.getStats("6m");
    const stats24m = candleStore.getStats("24m");

    logger.success(
      `🎯 Свечи загружены успешно:\n` +
        `  ├─ 1m:  ${stats1m.count}/${stats1m.totalCount} (${
          stats1m.isFull ? "ПОЛНЫЙ" : "частичный"
        })\n` +
        `  ├─ 6m:  ${stats6m.count}/${stats6m.totalCount} (${
          stats6m.isFull ? "ПОЛНЫЙ" : "частичный"
        })\n` +
        `  └─ 24m: ${stats24m.count}/${stats24m.totalCount} (${
          stats24m.isFull ? "ПОЛНЫЙ" : "частичный"
        })`,
      LogCategory.SYSTEM
    );

    // 7. Запускаем real-time обновление
    startCandleUpdater();
  } catch (error) {
    logger.error("❌ Ошибка загрузки исторических свечей", LogCategory.SYSTEM, {
      error,
    });
    throw error;
  }
}

// ============================================================================
// REAL-TIME ОБНОВЛЕНИЕ СВЕЧЕЙ
// ============================================================================

function startCandleUpdater(): void {
  let updateCount = 0;

  const updater = setInterval(async () => {
    try {
      // Получаем последнюю ЗАКРЫТУЮ свечу 1m
      const rawCandles = await gateioClient.getCandles({
        currencyPair: config.trading.symbols[0],
        interval: "1m",
        limit: 1,
      });

      if (rawCandles.length === 0) {
        logger.warn("⚠️ Нет данных от Gate.io", LogCategory.INTERNAL);
        return;
      }

      const newCandle = rawCandles[0];

      // Проверяем, что это не дубликат
      const last = candleStore.getLast("1m");
      if (last && last.timestamp === newCandle.timestamp) {
        logger.debug("⏭️ Дубликат свечи 1m, пропуск", LogCategory.INTERNAL);
        return;
      }

      updateCount++;

      // Добавляем в store
      candleStore.add("1m", newCandle);

      // Логируем каждую 10-ю свечу для снижения спама
      if (updateCount % 10 === 0) {
        const date = new Date(newCandle.timestamp);
        logger.info(
          `📊 Свеча 1m #${updateCount} [${date.toISOString()}]: ` +
            `C=${newCandle.close.toFixed(2)} V=${newCandle.volume.toFixed(4)}`,
          LogCategory.INTERNAL
        );
      }

      // Эмитим событие для CandleBuilder
      eventBus.emitSafe("data:candle:1m:completed", newCandle);
    } catch (error: any) {
      logger.error("❌ Ошибка обновления свечей", LogCategory.INTERNAL, {
        error: error.message,
      });

      // При критической сетевой ошибке - перезапуск через PM2
      if (isNetworkError(error)) {
        logger.error(
          "💥 КРИТИЧЕСКАЯ СЕТЕВАЯ ОШИБКА - ПЕРЕЗАПУСК ЧЕРЕЗ 5 СЕКУНД",
          LogCategory.SYSTEM
        );
        clearInterval(updater);
        setTimeout(() => {
          process.exit(1); // PM2 автоматически перезапустит
        }, 5000);
      }
    }
  }, 60000); // Каждую минуту (60 секунд)

  logger.success(
    "✅ Real-time обновление свечей 1m запущено (интервал: 60 секунд)",
    LogCategory.SYSTEM
  );
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

function isNetworkError(error: any): boolean {
  const networkErrors = [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ECONNRESET",
    "ENETUNREACH",
    "EAI_AGAIN",
  ];

  return networkErrors.some(
    (code) => error.code === code || error.message?.includes(code)
  );
}

function showSystemStats(): void {
  const eventStats = eventBus.getStats();
  const tickStats = tickStore.getStats();
  const obStats = orderBookStore.getStats();

  const stats1m = candleStore.getStats("1m");
  const stats6m = candleStore.getStats("6m");
  const stats24m = candleStore.getStats("24m");
  const bufferStatus = candleBuilder.getBufferStatus();

  logger.info(
    "\n" +
      "═══════════════════════════════════════════════════════════\n" +
      "📊 СТАТИСТИКА СИСТЕМЫ\n" +
      "═══════════════════════════════════════════════════════════\n" +
      "\n" +
      "🎯 EventBus:\n" +
      `  ├─ Всего эмитов: ${eventStats.totalEmits}\n` +
      `  ├─ Всего событий: ${eventStats.totalEvents}\n` +
      `  └─ Ошибок: ${eventStats.errors}\n` +
      "\n" +
      "📈 Тики:\n" +
      `  ├─ В буфере: ${tickStats.count}\n` +
      `  ├─ Всего: ${tickStats.totalCount}\n` +
      `  └─ Последняя цена: ${tickStats.lastPrice?.toFixed(2) || "N/A"}\n` +
      "\n" +
      "📖 Order Book:\n" +
      `  ├─ Best Bid: ${obStats.bestBid?.toFixed(2) || "N/A"}\n` +
      `  ├─ Best Ask: ${obStats.bestAsk?.toFixed(2) || "N/A"}\n` +
      `  ├─ Spread: ${obStats.spread?.toFixed(2) || "N/A"}\n` +
      `  └─ Давление: Bid ${obStats.bidPercent?.toFixed(
        1
      )}% / Ask ${obStats.askPercent?.toFixed(1)}%\n` +
      "\n" +
      "🕯️ Свечи:\n" +
      `  ├─ 1m:  ${stats1m.count}/${stats1m.totalCount} (last: ${
        stats1m.lastClose?.toFixed(2) || "N/A"
      })\n` +
      `  ├─ 6m:  ${stats6m.count}/${stats6m.totalCount} (last: ${
        stats6m.lastClose?.toFixed(2) || "N/A"
      })\n` +
      `  └─ 24m: ${stats24m.count}/${stats24m.totalCount} (last: ${
        stats24m.lastClose?.toFixed(2) || "N/A"
      })\n` +
      "\n" +
      "🔄 Буферы агрегации:\n" +
      `  ├─ 1m → 6m:  ${bufferStatus.buffer1m.count}/6 (ещё ${bufferStatus.buffer1m.nextIn})\n` +
      `  └─ 6m → 24m: ${bufferStatus.buffer6m.count}/4 (ещё ${bufferStatus.buffer6m.nextIn})\n` +
      "\n" +
      "═══════════════════════════════════════════════════════════\n",
    LogCategory.INTERNAL
  );
}

// ============================================================================
// MAIN ФУНКЦИЯ
// ============================================================================

async function main(): Promise<void> {
  try {
    logger.success("🚀 DTRADER-CRYPTO-2.0 ЗАПУСКАЕТСЯ!", LogCategory.SYSTEM);
    logger.info(`Режим: ${config.mode}`, LogCategory.SYSTEM);
    logger.info(
      `Торговая пара: ${config.trading.symbols[0]}`,
      LogCategory.SYSTEM
    );

    logger.info("💰 Проверка баланса...", LogCategory.SYSTEM);
    const balances = await gateioClient.getBalance();
    logger.success(
      `✅ Баланс получен: ${balances.length} валют`,
      LogCategory.SYSTEM
    );

    logger.info("📊 Получение данных рынка...", LogCategory.SYSTEM);
    const ticker = await gateioClient.getTicker(config.trading.symbols[0]);
    logger.success(
      `✅ Текущая цена ${config.trading.symbols[0]}: ${ticker.last}`,
      LogCategory.SYSTEM
    );

    logger.info("🗄️ Инициализация хранилищ...", LogCategory.SYSTEM);

    logger.info("📖 Синхронизация Order Book...", LogCategory.SYSTEM);
    await orderBookStore.sync();
    orderBookStore.debug();

    await initializeCandleData();

    logger.info("🔌 Подключение к Gate.io WebSocket...", LogCategory.SYSTEM);
    await gateioWebSocket.connect();
    await gateioWebSocket.subscribe();

    eventBus.emitSafe("system:ready");
    logger.success("🎯 СИСТЕМА ГОТОВА К ТОРГОВЛЕ!", LogCategory.SYSTEM);
    logger.success(
      "💪 ПОРВЁМ GATE.IO К ЧЕРТЯМ СОБАЧЬИМ!!!",
      LogCategory.SYSTEM
    );

    setInterval(() => {
      showSystemStats();
    }, 5 * 60 * 1000);
  } catch (error) {
    logger.error("💥 Критическая ошибка запуска", LogCategory.SYSTEM, {
      error,
    });
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  logger.warn("⚠️ Получен SIGINT, завершение работы...", LogCategory.SYSTEM);
  gateioWebSocket.disconnect();
  showSystemStats();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.warn("⚠️ Получен SIGTERM, завершение работы...", LogCategory.SYSTEM);
  gateioWebSocket.disconnect();
  showSystemStats();
  process.exit(0);
});

main().catch((error) => {
  logger.error("💥 Необработанная ошибка", LogCategory.SYSTEM, { error });
  process.exit(1);
});
