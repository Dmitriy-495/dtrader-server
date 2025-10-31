import { eventBus } from "../core/EventBus";
import { candleStore } from "./CandleStore";
import { Candle, Timeframe, TIMEFRAME_MS, AGGREGATION_COUNT } from "./types";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";

/**
 * CandleBuilder - агрегатор свечей
 *
 * Логика:
 * 1. Слушает событие 'data:candle:1m:completed'
 * 2. Накапливает 6 свечей 1m → формирует 1 свечу 6m
 * 3. Эмитит 'data:candle:6m:completed'
 * 4. Накапливает 4 свечи 6m → формирует 1 свечу 24m
 * 5. Эмитит 'data:candle:24m:completed'
 */
class CandleBuilder {
  // ============================================================================
  // БУФЕРЫ НАКОПЛЕНИЯ
  // ============================================================================

  private accumulator1m: Candle[] = []; // Буфер для 1m → 6m (max 6)
  private accumulator6m: Candle[] = []; // Буфер для 6m → 24m (max 4)

  // Последние timestamp обработанных свечей для проверки пропусков
  private lastProcessed1m: number | null = null;
  private lastProcessed6m: number | null = null;

  // ============================================================================
  // КОНСТРУКТОР
  // ============================================================================

  constructor() {
    // Подписываемся на завершённые 1m свечи
    eventBus.on("data:candle:1m:completed", this.handle1mCandle.bind(this));

    logger.success("✅ CandleBuilder инициализирован", LogCategory.SYSTEM);
  }

  // ============================================================================
  // ОБРАБОТЧИКИ
  // ============================================================================

  /**
   * Обработка новой 1m свечи
   */
  private handle1mCandle(candle: Candle): void {
    // Проверяем, что timestamp корректный (кратен 1m)
    if (!this.isValidTimestamp(candle.timestamp, "1m")) {
      logger.warn(
        `⚠️ Некорректный timestamp свечи 1m: ${candle.timestamp} (не кратен 60 секундам)`,
        LogCategory.INTERNAL
      );
      return; // Игнорируем
    }

    // Проверяем пропуски
    if (this.lastProcessed1m !== null) {
      const expectedNext = this.lastProcessed1m + TIMEFRAME_MS["1m"];
      if (candle.timestamp !== expectedNext) {
        const gap =
          (candle.timestamp - this.lastProcessed1m) / TIMEFRAME_MS["1m"];
        logger.error(
          `❌ ПРОПУСК СВЕЧЕЙ 1m! Ожидалось: ${new Date(
            expectedNext
          ).toISOString()}, ` +
            `получено: ${new Date(
              candle.timestamp
            ).toISOString()} (gap: ${gap} свечей)`,
          LogCategory.INTERNAL
        );

        // Пытаемся получить пропущенные свечи
        this.handleMissingCandles("1m", this.lastProcessed1m, candle.timestamp);
      }
    }

    this.lastProcessed1m = candle.timestamp;

    // Добавляем в буфер
    this.accumulator1m.push(candle);

    logger.debug(
      `📊 1m буфер: ${this.accumulator1m.length}/${AGGREGATION_COUNT["1m-to-6m"]}`,
      LogCategory.INTERNAL
    );

    // Проверяем временную синхронизацию для 6m
    if (!this.isTimeAligned(candle.timestamp, "6m")) {
      // Свеча не попадает на границу 6m - ждём следующую
      return;
    }

    // Если накопилось 6 свечей - формируем 6m
    if (this.accumulator1m.length === AGGREGATION_COUNT["1m-to-6m"]) {
      const candle6m = this.aggregate(this.accumulator1m, "6m");

      // Добавляем в store
      candleStore.add("6m", candle6m);

      // Эмитим событие
      eventBus.emitSafe("data:candle:6m:completed", candle6m);

      // Очищаем буфер
      this.accumulator1m = [];

      // Обрабатываем 6m → 24m
      this.handle6mCandle(candle6m);
    } else if (this.accumulator1m.length > AGGREGATION_COUNT["1m-to-6m"]) {
      // Переполнение - сбрасываем и начинаем заново
      logger.warn(
        `⚠️ Переполнение буфера 1m (${this.accumulator1m.length}), сброс`,
        LogCategory.INTERNAL
      );
      this.accumulator1m = [];
    }
  }

  /**
   * Обработка новой 6m свечи
   */
  private handle6mCandle(candle: Candle): void {
    // Проверяем пропуски
    if (this.lastProcessed6m !== null) {
      const expectedNext = this.lastProcessed6m + TIMEFRAME_MS["6m"];
      if (candle.timestamp !== expectedNext) {
        const gap =
          (candle.timestamp - this.lastProcessed6m) / TIMEFRAME_MS["6m"];
        logger.error(
          `❌ ПРОПУСК СВЕЧЕЙ 6m! Ожидалось: ${new Date(
            expectedNext
          ).toISOString()}, ` +
            `получено: ${new Date(
              candle.timestamp
            ).toISOString()} (gap: ${gap} свечей)`,
          LogCategory.INTERNAL
        );

        this.handleMissingCandles("6m", this.lastProcessed6m, candle.timestamp);
      }
    }

    this.lastProcessed6m = candle.timestamp;

    // Добавляем в буфер
    this.accumulator6m.push(candle);

    logger.debug(
      `📊 6m буфер: ${this.accumulator6m.length}/${AGGREGATION_COUNT["6m-to-24m"]}`,
      LogCategory.INTERNAL
    );

    // Проверяем временную синхронизацию для 24m
    if (!this.isTimeAligned(candle.timestamp, "24m")) {
      return;
    }

    // Если накопилось 4 свечи - формируем 24m
    if (this.accumulator6m.length === AGGREGATION_COUNT["6m-to-24m"]) {
      const candle24m = this.aggregate(this.accumulator6m, "24m");

      // Добавляем в store
      candleStore.add("24m", candle24m);

      // Эмитим событие
      eventBus.emitSafe("data:candle:24m:completed", candle24m);

      // Очищаем буфер
      this.accumulator6m = [];
    } else if (this.accumulator6m.length > AGGREGATION_COUNT["6m-to-24m"]) {
      logger.warn(
        `⚠️ Переполнение буфера 6m (${this.accumulator6m.length}), сброс`,
        LogCategory.INTERNAL
      );
      this.accumulator6m = [];
    }
  }

  // ============================================================================
  // АГРЕГАЦИЯ
  // ============================================================================

  /**
   * Универсальная функция агрегации свечей
   */
  private aggregate(candles: Candle[], targetTimeframe: Timeframe): Candle {
    return {
      timestamp: candles[0].timestamp, // Первой свечи
      open: candles[0].open, // Первой свечи
      close: candles[candles.length - 1].close, // Последней свечи ⭐
      high: Math.max(...candles.map((c) => c.high)),
      low: Math.min(...candles.map((c) => c.low)),
      volume: candles.reduce((sum, c) => sum + c.volume, 0),
      quoteVolume: candles.reduce((sum, c) => sum + c.quoteVolume, 0),
    };
  }

  // ============================================================================
  // ВАЛИДАЦИЯ И СИНХРОНИЗАЦИЯ
  // ============================================================================

  /**
   * Проверка, что timestamp корректный (кратен таймфрейму)
   */
  private isValidTimestamp(timestamp: number, timeframe: Timeframe): boolean {
    const tfMs = TIMEFRAME_MS[timeframe];
    return timestamp % tfMs === 0;
  }

  /**
   * Проверка, что timestamp попадает на границу таймфрейма
   *
   * Пример для 6m:
   * - Валидные: 00:00, 00:06, 00:12, 00:18, 00:24, 00:30, ...
   * - Невалидные: 00:01, 00:07, 00:13, ...
   */
  private isTimeAligned(
    timestamp: number,
    targetTimeframe: Timeframe
  ): boolean {
    const tfMs = TIMEFRAME_MS[targetTimeframe];
    return timestamp % tfMs === 0;
  }

  // ============================================================================
  // ОБРАБОТКА ПРОПУСКОВ
  // ============================================================================

  /**
   * Попытка получить пропущенные свечи через REST API
   * Вариант В из требований
   */
  private async handleMissingCandles(
    timeframe: Timeframe,
    lastTimestamp: number,
    currentTimestamp: number
  ): Promise<void> {
    logger.warn(
      `🔄 Попытка восстановить пропущенные свечи ${timeframe} ` +
        `с ${new Date(lastTimestamp).toISOString()} ` +
        `до ${new Date(currentTimestamp).toISOString()}`,
      LogCategory.INTERNAL
    );

    // TODO: Реализовать запрос к GateioClient.getCandles()
    // const missingCandles = await gateioClient.getCandles({
    //   currencyPair: 'ETH_USDT',
    //   interval: timeframe,
    //   from: Math.floor(lastTimestamp / 1000),
    //   to: Math.floor(currentTimestamp / 1000)
    // });

    // Эмитим событие для каждой пропущенной свечи
    // missingCandles.forEach(candle => {
    //   eventBus.emitSafe(`data:candle:${timeframe}:completed`, candle);
    // });
  }

  // ============================================================================
  // ИНИЦИАЛИЗАЦИЯ ИЗ ИСТОРИИ
  // ============================================================================

  /**
   * Заполнить буферы из исторических данных CandleStore
   * Вызывается после загрузки истории от Gate.io
   */
  public initializeFromHistory(): void {
    logger.info(
      "🔄 Восстановление буферов из истории...",
      LogCategory.INTERNAL
    );

    // Получаем последние 6 свечей 1m
    const last1m = candleStore.getLastN("1m", AGGREGATION_COUNT["1m-to-6m"]);

    if (last1m.length > 0 && last1m.length < AGGREGATION_COUNT["1m-to-6m"]) {
      // Проверяем, что они выровнены по времени
      const firstTs = last1m[0].timestamp;
      if (this.isTimeAligned(firstTs, "6m")) {
        this.accumulator1m = last1m;
        this.lastProcessed1m = last1m[last1m.length - 1].timestamp;
        logger.info(
          `✅ Буфер 1m восстановлен: ${last1m.length}/${AGGREGATION_COUNT["1m-to-6m"]} свечей`,
          LogCategory.INTERNAL
        );
      }
    }

    // Аналогично для 6m → 24m
    const last6m = candleStore.getLastN("6m", AGGREGATION_COUNT["6m-to-24m"]);
    if (last6m.length > 0 && last6m.length < AGGREGATION_COUNT["6m-to-24m"]) {
      const firstTs = last6m[0].timestamp;
      if (this.isTimeAligned(firstTs, "24m")) {
        this.accumulator6m = last6m;
        this.lastProcessed6m = last6m[last6m.length - 1].timestamp;
        logger.info(
          `✅ Буфер 6m восстановлен: ${last6m.length}/${AGGREGATION_COUNT["6m-to-24m"]} свечей`,
          LogCategory.INTERNAL
        );
      }
    }
  }

  // ============================================================================
  // УТИЛИТЫ
  // ============================================================================

  /**
   * Получить состояние буферов (для отладки)
   */
  public getBufferStatus(): {
    buffer1m: { count: number; nextIn: number; candles: Candle[] };
    buffer6m: { count: number; nextIn: number; candles: Candle[] };
  } {
    return {
      buffer1m: {
        count: this.accumulator1m.length,
        nextIn: AGGREGATION_COUNT["1m-to-6m"] - this.accumulator1m.length,
        candles: [...this.accumulator1m],
      },
      buffer6m: {
        count: this.accumulator6m.length,
        nextIn: AGGREGATION_COUNT["6m-to-24m"] - this.accumulator6m.length,
        candles: [...this.accumulator6m],
      },
    };
  }

  /**
   * Очистить буферы (для перезапуска)
   */
  public reset(): void {
    this.accumulator1m = [];
    this.accumulator6m = [];
    this.lastProcessed1m = null;
    this.lastProcessed6m = null;
    logger.info("🗑️ CandleBuilder буферы очищены", LogCategory.INTERNAL);
  }
}

// Singleton экспорт
export const candleBuilder = new CandleBuilder();
