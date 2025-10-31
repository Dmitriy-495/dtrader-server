import { Candle, Timeframe, CandleStats, TIMEFRAME_MS } from "./types";
import { config } from "../config/env";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";

/**
 * CandleStore - хранилище свечей всех таймфреймов
 *
 * Архитектура:
 * - 3 отдельных Circular Buffer для 1m, 6m, 24m
 * - Автоматическое удаление старых свечей при переполнении
 * - Методы получения последних N свечей
 * - Статистика по каждому таймфрейму
 */
class CandleStore {
  private readonly symbol: string;

  // ============================================================================
  // КОНФИГУРАЦИЯ БУФЕРОВ
  // ============================================================================

  private readonly bufferSizes: Record<Timeframe, number> = {
    "1m": 500, // ~8 часов истории
    "6m": 240, // ~24 часа истории
    "24m": 120, // ~48 часов истории
  };

  // ============================================================================
  // ХРАНИЛИЩЕ
  // ============================================================================

  private candles: Record<Timeframe, Candle[]> = {
    "1m": [],
    "6m": [],
    "24m": [],
  };

  private totalCounts: Record<Timeframe, number> = {
    "1m": 0,
    "6m": 0,
    "24m": 0,
  };

  // ============================================================================
  // КОНСТРУКТОР
  // ============================================================================

  constructor(symbol: string) {
    this.symbol = symbol;
    logger.info(
      `📊 CandleStore инициализирован для ${symbol}`,
      LogCategory.INTERNAL
    );
  }

  // ============================================================================
  // ОСНОВНЫЕ МЕТОДЫ
  // ============================================================================

  /**
   * Добавить свечу в хранилище
   * Если буфер заполнен - удаляет самую старую
   */
  public add(timeframe: Timeframe, candle: Candle): void {
    const buffer = this.candles[timeframe];
    const maxSize = this.bufferSizes[timeframe];

    // Проверка на дубликат
    if (this.isDuplicate(timeframe, candle)) {
      logger.warn(
        `⚠️ Дубликат свечи ${timeframe} @ ${new Date(
          candle.timestamp
        ).toISOString()}`,
        LogCategory.INTERNAL
      );
      return;
    }

    // Добавляем свечу
    buffer.push(candle);
    this.totalCounts[timeframe]++;

    // Удаляем старую если переполнение
    if (buffer.length > maxSize) {
      const removed = buffer.shift();
      logger.debug(
        `🗑️ Удалена старая свеча ${timeframe} @ ${new Date(
          removed!.timestamp
        ).toISOString()}`,
        LogCategory.INTERNAL
      );
    }

    // Логируем только ключевые события (6m и 24m)
    if (timeframe === "6m" || timeframe === "24m") {
      const date = new Date(candle.timestamp);
      logger.success(
        `✅ Свеча ${timeframe} [${date.toISOString()}]: ` +
          `O=${candle.open.toFixed(2)} H=${candle.high.toFixed(2)} ` +
          `L=${candle.low.toFixed(2)} C=${candle.close.toFixed(2)} ` +
          `V=${candle.volume.toFixed(4)}`,
        LogCategory.INTERNAL
      );
    }
  }

  /**
   * Получить последнюю свечу
   */
  public getLast(timeframe: Timeframe): Candle | undefined {
    const buffer = this.candles[timeframe];
    return buffer[buffer.length - 1];
  }

  /**
   * Получить последние N свечей
   * Возвращает от старых к новым
   */
  public getLastN(timeframe: Timeframe, count: number): Candle[] {
    const buffer = this.candles[timeframe];
    return buffer.slice(-count);
  }

  /**
   * Получить все свечи
   */
  public getAll(timeframe: Timeframe): Candle[] {
    return [...this.candles[timeframe]];
  }

  /**
   * Получить свечи за определённый период (в миллисекундах)
   */
  public getForPeriod(timeframe: Timeframe, periodMs: number): Candle[] {
    const now = Date.now();
    const cutoff = now - periodMs;
    return this.candles[timeframe].filter((c) => c.timestamp >= cutoff);
  }

  /**
   * Количество свечей в буфере
   */
  public getCount(timeframe: Timeframe): number {
    return this.candles[timeframe].length;
  }

  /**
   * Всего получено свечей
   */
  public getTotalCount(timeframe: Timeframe): number {
    return this.totalCounts[timeframe];
  }

  /**
   * Проверка на дубликат
   */
  private isDuplicate(timeframe: Timeframe, candle: Candle): boolean {
    const last = this.getLast(timeframe);
    return last?.timestamp === candle.timestamp;
  }

  /**
   * Заполнен ли буфер
   */
  public isFull(timeframe: Timeframe): boolean {
    return this.candles[timeframe].length >= this.bufferSizes[timeframe];
  }

  /**
   * Статистика по таймфрейму
   */
  public getStats(timeframe: Timeframe): CandleStats {
    const buffer = this.candles[timeframe];

    if (buffer.length === 0) {
      return {
        timeframe,
        count: 0,
        totalCount: this.totalCounts[timeframe],
        isFull: false,
        lastClose: null,
        avgVolume: 0,
        avgQuoteVolume: 0,
        highestHigh: null,
        lowestLow: null,
        lastTimestamp: null,
        oldestTimestamp: null,
      };
    }

    const avgVolume =
      buffer.reduce((sum, c) => sum + c.volume, 0) / buffer.length;
    const avgQuoteVolume =
      buffer.reduce((sum, c) => sum + c.quoteVolume, 0) / buffer.length;
    const highestHigh = Math.max(...buffer.map((c) => c.high));
    const lowestLow = Math.min(...buffer.map((c) => c.low));
    const last = buffer[buffer.length - 1];
    const oldest = buffer[0];

    return {
      timeframe,
      count: buffer.length,
      totalCount: this.totalCounts[timeframe],
      isFull: this.isFull(timeframe),
      lastClose: last.close,
      avgVolume,
      avgQuoteVolume,
      highestHigh,
      lowestLow,
      lastTimestamp: last.timestamp,
      oldestTimestamp: oldest.timestamp,
    };
  }

  /**
   * Очистить буфер (для перезапуска)
   */
  public clear(timeframe?: Timeframe): void {
    if (timeframe) {
      this.candles[timeframe] = [];
      logger.info(`🗑️ Буфер ${timeframe} очищен`, LogCategory.INTERNAL);
    } else {
      this.candles = { "1m": [], "6m": [], "24m": [] };
      this.totalCounts = { "1m": 0, "6m": 0, "24m": 0 };
      logger.info("🗑️ Все буферы свечей очищены", LogCategory.INTERNAL);
    }
  }
}

// Singleton экспорт
export const candleStore = new CandleStore(config.trading.symbol);
