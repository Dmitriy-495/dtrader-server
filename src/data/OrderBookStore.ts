/**
 * @file src/data/OrderBookStore.ts
 * @version 0
 * @description Хранилище и синхронизация Order Book
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { eventBus } from "../core/EventBus";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { GateioClient } from "../exchange/GateioClient";
import {
  OrderBookLevel,
  OrderBookUpdate,
  OrderBookSnapshot,
  OrderBookStats,
} from "./types";

/**
 * Хранилище Order Book с инкрементальной синхронизацией
 *
 * Особенности:
 * - Полная синхронизация стакана через REST API
 * - Инкрементальные обновления через WebSocket
 * - Автоматическая ресинхронизация при рассинхронизации
 * - Расчёт статистики (спред, объёмы, давление)
 *
 * @example
 * const orderBookStore = new OrderBookStore('ETH_USDT', gateioClient);
 * await orderBookStore.sync(); // Начальная синхронизация
 *
 * // Получить текущий стакан
 * const snapshot = orderBookStore.getSnapshot();
 *
 * // Получить статистику
 * const stats = orderBookStore.getStats();
 * console.log(`Спред: ${stats.spread} USDT`);
 */
export class OrderBookStore {
  private symbol: string;
  private gateioClient: GateioClient;

  // Данные orderbook
  private bids: Map<number, number> = new Map(); // price → amount
  private asks: Map<number, number> = new Map(); // price → amount
  private lastUpdateId: number = 0;
  private lastSyncTime: number = 0;
  private updateCount: number = 0;

  // Параметры
  private maxLevels: number = 20;
  private syncInterval: number = 3600000; // 1 час

  /**
   * Конструктор
   *
   * @param symbol - торговая пара
   * @param gateioClient - REST API клиент для синхронизации
   * @param maxLevels - максимальное количество уровней (по умолчанию 20)
   */
  constructor(
    symbol: string,
    gateioClient: GateioClient,
    maxLevels: number = 20
  ) {
    this.symbol = symbol;
    this.gateioClient = gateioClient;
    this.maxLevels = maxLevels;

    logger.debug(`OrderBookStore создан для ${symbol}`, LogCategory.INTERNAL);

    // Подписываемся на обновления
    this.setupEventListeners();

    // Запускаем периодическую ресинхронизацию
    this.startPeriodicSync();
  }

  /**
   * Подписка на события
   */
  private setupEventListeners(): void {
    eventBus.on("data:orderbook:updated", (update: OrderBookUpdate) => {
      // Проверяем что это наш символ
      if (update.symbol === this.symbol) {
        this.applyUpdate(update);
      }
    });
  }

  /**
   * Начальная синхронизация стакана через REST API
   */
  public async sync(): Promise<void> {
    try {
      logger.info(
        `Синхронизация Order Book для ${this.symbol}...`,
        LogCategory.INTERNAL
      );

      // Получаем полный стакан через REST
      const orderBook = await this.gateioClient.getOrderBook(
        this.symbol,
        this.maxLevels
      );

      // Очищаем старые данные
      this.bids.clear();
      this.asks.clear();

      // Загружаем bids
      orderBook.bids.forEach((level) => {
        const price = parseFloat(level.price);
        const amount = parseFloat(level.amount);
        this.bids.set(price, amount);
      });

      // Загружаем asks
      orderBook.asks.forEach((level) => {
        const price = parseFloat(level.price);
        const amount = parseFloat(level.amount);
        this.asks.set(price, amount);
      });

      this.lastUpdateId = orderBook.id;
      this.lastSyncTime = Date.now();

      logger.success(
        `✅ Order Book синхронизирован: ${this.bids.size} bids, ${this.asks.size} asks`,
        LogCategory.INTERNAL
      );

      // Эмитим событие синхронизации
      eventBus.emitSafe("data:orderbook:synced", {
        symbol: this.symbol,
        bidsCount: this.bids.size,
        asksCount: this.asks.size,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(
        `Ошибка синхронизации Order Book: ${error.message}`,
        LogCategory.INTERNAL
      );
      throw error;
    }
  }

  /**
   * Применить инкрементальное обновление
   *
   * @param update - обновление orderbook
   */
  private applyUpdate(update: OrderBookUpdate): void {
    this.updateCount++;

    // Применяем обновления bids
    update.bids.forEach((level) => {
      if (level.amount === 0) {
        // Удаляем уровень
        this.bids.delete(level.price);
      } else {
        // Обновляем/добавляем уровень
        this.bids.set(level.price, level.amount);
      }
    });

    // Применяем обновления asks
    update.asks.forEach((level) => {
      if (level.amount === 0) {
        // Удаляем уровень
        this.asks.delete(level.price);
      } else {
        // Обновляем/добавляем уровень
        this.asks.set(level.price, level.amount);
      }
    });

    this.lastUpdateId = update.updateId;

    logger.debug(
      `OrderBook обновлён #${this.updateCount}: ${update.bids.length} bids, ${update.asks.length} asks`,
      LogCategory.INTERNAL
    );
  }

  /**
   * Запуск периодической ресинхронизации
   */
  private startPeriodicSync(): void {
    setInterval(async () => {
      const timeSinceSync = Date.now() - this.lastSyncTime;

      if (timeSinceSync >= this.syncInterval) {
        logger.info(
          "Периодическая ресинхронизация Order Book...",
          LogCategory.INTERNAL
        );
        await this.sync();
      }
    }, this.syncInterval);
  }

  /**
   * Получить снимок текущего стакана
   *
   * @returns снимок orderbook
   */
  public getSnapshot(): OrderBookSnapshot {
    // Сортируем bids по убыванию цены
    const sortedBids = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([price, amount]) => ({ price, amount }));

    // Сортируем asks по возрастанию цены
    const sortedAsks = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([price, amount]) => ({ price, amount }));

    return {
      symbol: this.symbol,
      bids: sortedAsks.slice(0, this.maxLevels),
      asks: sortedBids.slice(0, this.maxLevels),
      timestamp: Date.now(),
      lastUpdateId: this.lastUpdateId,
    };
  }

  /**
   * Получить N лучших bids
   *
   * @param count - количество уровней
   * @returns массив bids
   */
  public getBids(count: number = this.maxLevels): OrderBookLevel[] {
    return Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, count)
      .map(([price, amount]) => ({ price, amount }));
  }

  /**
   * Получить N лучших asks
   *
   * @param count - количество уровней
   * @returns массив asks
   */
  public getAsks(count: number = this.maxLevels): OrderBookLevel[] {
    return Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, count)
      .map(([price, amount]) => ({ price, amount }));
  }

  /**
   * Получить статистику orderbook
   *
   * @returns статистика
   */
  public getStats(): OrderBookStats {
    const bids = this.getBids(this.maxLevels);
    const asks = this.getAsks(this.maxLevels);

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;

    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    // Рассчитываем объёмы (price * amount)
    const bidVolume = bids.reduce(
      (sum, level) => sum + level.price * level.amount,
      0
    );
    const askVolume = asks.reduce(
      (sum, level) => sum + level.price * level.amount,
      0
    );
    const totalVolume = bidVolume + askVolume;

    const bidPercent = totalVolume > 0 ? (bidVolume / totalVolume) * 100 : 50;
    const askPercent = totalVolume > 0 ? (askVolume / totalVolume) * 100 : 50;

    return {
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      midPrice,
      bidVolume,
      askVolume,
      totalVolume,
      bidPercent,
      askPercent,
    };
  }

  /**
   * Получить количество обновлений
   *
   * @returns количество обновлений
   */
  public getUpdateCount(): number {
    return this.updateCount;
  }

  /**
   * Получить время последней синхронизации
   *
   * @returns Unix timestamp в миллисекундах
   */
  public getLastSyncTime(): number {
    return this.lastSyncTime;
  }
}
