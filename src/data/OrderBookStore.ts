/**
 * @file src/data/OrderBookStore.ts
 * @version 2.0.0 - ПОЛНАЯ ПЕРЕРАБОТКА
 * @description Хранилище Order Book с детальным логированием
 * @changelog
 *   2.0.0 - Полная переработка с отладочными логами (2025-01-22)
 *   1 - Исправлен баг с перевёрнутыми bid/ask (2025-01-22)
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
 * Хранилище Order Book
 *
 * ИСТОЧНИКИ ДАННЫХ:
 * 1. REST API (sync) - полный snapshot
 * 2. WebSocket (applyUpdate) - инкрементальные обновления
 *
 * ЛОГИКА:
 * 1. При старте: sync() получает snapshot через REST
 * 2. WebSocket шлёт обновления → applyUpdate() применяет их
 * 3. Каждый час: sync() заново синхронизирует (на случай рассинхронизации)
 */
export class OrderBookStore {
  private symbol: string;
  private gateioClient: GateioClient;

  // Данные orderbook
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private lastUpdateId: number = 0;
  private lastSyncTime: number = 0;
  private updateCount: number = 0;

  private maxLevels: number = 20;
  private syncInterval: number = 3600000; // 1 час

  constructor(
    symbol: string,
    gateioClient: GateioClient,
    maxLevels: number = 20
  ) {
    this.symbol = symbol;
    this.gateioClient = gateioClient;
    this.maxLevels = maxLevels;

    logger.debug(
      `📖 OrderBookStore создан для ${symbol} (макс. ${maxLevels} уровней)`,
      LogCategory.INTERNAL
    );

    this.setupEventListeners();
    this.startPeriodicSync();
  }

  /**
   * Подписка на WebSocket события
   */
  private setupEventListeners(): void {
    eventBus.on("data:orderbook:updated", (update: OrderBookUpdate) => {
      if (update.symbol === this.symbol) {
        this.applyUpdate(update);
      }
    });
  }

  /**
   * Начальная синхронизация через REST API
   */
  public async sync(): Promise<void> {
    try {
      logger.info(
        `🔄 Синхронизация Order Book для ${this.symbol} через REST API...`,
        LogCategory.INTERNAL
      );

      const orderBook = await this.gateioClient.getOrderBook(
        this.symbol,
        this.maxLevels
      );

      // 🔍 DEBUG: Смотрим что РЕАЛЬНО приходит от Gate.io
      logger.debug(`📦 RAW данные от REST API`, LogCategory.INTERNAL, {
        id: orderBook.id,
        bidsCount: orderBook.bids.length,
        asksCount: orderBook.asks.length,
        firstBid: orderBook.bids[0],
        firstAsk: orderBook.asks[0],
        bidType: typeof orderBook.bids[0],
        bidIsArray: Array.isArray(orderBook.bids[0]),
      });

      // Очищаем старые данные
      this.bids.clear();
      this.asks.clear();

      // Загружаем bids
      orderBook.bids.forEach((level, index) => {
        // 🔍 Gate.io REST API возвращает МАССИВЫ: ["price", "amount"]
        // А не объекты: {price: "...", amount: "..."}
        let price: number;
        let amount: number;

        if (Array.isArray(level)) {
          // Формат: ["3890.50", "1.5"]
          price = parseFloat(level[0]);
          amount = parseFloat(level[1]);
        } else if (typeof level === "object" && level !== null) {
          // Формат: {price: "3890.50", amount: "1.5"}
          price = parseFloat((level as any).price);
          amount = parseFloat((level as any).amount);
        } else {
          logger.warn(
            `⚠️ Неизвестный формат bid #${index}`,
            LogCategory.INTERNAL,
            { level }
          );
          return;
        }

        if (isNaN(price) || isNaN(amount)) {
          logger.warn(
            `⚠️ Некорректный bid: price=${price}, amount=${amount}`,
            LogCategory.INTERNAL
          );
          return;
        }

        this.bids.set(price, amount);
      });

      // Загружаем asks
      orderBook.asks.forEach((level, index) => {
        let price: number;
        let amount: number;

        if (Array.isArray(level)) {
          price = parseFloat(level[0]);
          amount = parseFloat(level[1]);
        } else if (typeof level === "object" && level !== null) {
          price = parseFloat((level as any).price);
          amount = parseFloat((level as any).amount);
        } else {
          logger.warn(
            `⚠️ Неизвестный формат ask #${index}`,
            LogCategory.INTERNAL,
            { level }
          );
          return;
        }

        if (isNaN(price) || isNaN(amount)) {
          logger.warn(
            `⚠️ Некорректный ask: price=${price}, amount=${amount}`,
            LogCategory.INTERNAL
          );
          return;
        }

        this.asks.set(price, amount);
      });

      this.lastUpdateId = orderBook.id;
      this.lastSyncTime = Date.now();

      // Проверяем что данные загружены
      const stats = this.getStats();

      logger.success(
        `✅ Order Book синхронизирован: ${this.bids.size} bids, ${this.asks.size} asks`,
        LogCategory.INTERNAL
      );

      logger.info(
        `📊 Лучшие цены: bid=${stats.bestBid.toFixed(
          2
        )}, ask=${stats.bestAsk.toFixed(2)}, spread=${stats.spread.toFixed(2)}`,
        LogCategory.INTERNAL
      );

      eventBus.emitSafe("data:orderbook:synced", {
        symbol: this.symbol,
        bidsCount: this.bids.size,
        asksCount: this.asks.size,
        bestBid: stats.bestBid,
        bestAsk: stats.bestAsk,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      logger.error(
        `❌ Ошибка синхронизации Order Book: ${error.message}`,
        LogCategory.INTERNAL
      );
      throw error;
    }
  }

  /**
   * Применить инкрементальное обновление от WebSocket
   */
  private applyUpdate(update: OrderBookUpdate): void {
    this.updateCount++;

    let bidsChanged = 0;
    let asksChanged = 0;

    // Применяем обновления bids
    update.bids.forEach((level) => {
      if (level.amount === 0) {
        // Удаляем уровень
        if (this.bids.delete(level.price)) {
          bidsChanged++;
        }
      } else {
        // Обновляем/добавляем уровень
        this.bids.set(level.price, level.amount);
        bidsChanged++;
      }
    });

    // Применяем обновления asks
    update.asks.forEach((level) => {
      if (level.amount === 0) {
        if (this.asks.delete(level.price)) {
          asksChanged++;
        }
      } else {
        this.asks.set(level.price, level.amount);
        asksChanged++;
      }
    });

    this.lastUpdateId = update.updateId;

    // Логируем только значимые обновления
    if (bidsChanged > 0 || asksChanged > 0) {
      logger.debug(
        `📈 OrderBook обновлён #${this.updateCount}: ${bidsChanged} bids, ${asksChanged} asks изменено`,
        LogCategory.INTERNAL
      );
    }

    // Каждые 20 обновлений — информативный лог
    if (this.updateCount % 20 === 0) {
      const stats = this.getStats();
      logger.info(
        `📖 OrderBook #${this.updateCount}: bid ${stats.bestBid.toFixed(2)} | ask ${stats.bestAsk.toFixed(2)} | spread ${stats.spread.toFixed(2)} (${stats.spreadPercent.toFixed(3)}%) | давление: ${stats.bidPercent.toFixed(1)}% / ${stats.askPercent.toFixed(1)}%`,
        LogCategory.INTERNAL
      );
    }
  }

  /**
   * Периодическая ресинхронизация
   */
  private startPeriodicSync(): void {
    setInterval(async () => {
      const timeSinceSync = Date.now() - this.lastSyncTime;

      if (timeSinceSync >= this.syncInterval) {
        logger.info(
          "⏰ Периодическая ресинхронизация Order Book...",
          LogCategory.INTERNAL
        );

        try {
          await this.sync();
        } catch (error) {
          logger.error(
            "Ошибка периодической синхронизации",
            LogCategory.INTERNAL,
            error
          );
        }
      }
    }, this.syncInterval);
  }

  /**
   * Получить snapshot текущего стакана
   */
  public getSnapshot(): OrderBookSnapshot {
    // Bids: от высшей цены к низшей
    const sortedBids = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, this.maxLevels)
      .map(([price, amount]) => ({ price, amount }));

    // Asks: от низшей цены к высшей
    const sortedAsks = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, this.maxLevels)
      .map(([price, amount]) => ({ price, amount }));

    return {
      symbol: this.symbol,
      bids: sortedBids,
      asks: sortedAsks,
      timestamp: Date.now(),
      lastUpdateId: this.lastUpdateId,
    };
  }

  /**
   * Получить N лучших bids
   */
  public getBids(count: number = this.maxLevels): OrderBookLevel[] {
    return Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, count)
      .map(([price, amount]) => ({ price, amount }));
  }

  /**
   * Получить N лучших asks
   */
  public getAsks(count: number = this.maxLevels): OrderBookLevel[] {
    return Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, count)
      .map(([price, amount]) => ({ price, amount }));
  }

  /**
   * Получить статистику orderbook
   */
  public getStats(): OrderBookStats {
    const bids = this.getBids(this.maxLevels);
    const asks = this.getAsks(this.maxLevels);

    // Проверка наличия данных
    if (bids.length === 0 || asks.length === 0) {
      logger.warn(
        `⚠️ OrderBook пустой! bids=${bids.length}, asks=${asks.length}`,
        LogCategory.INTERNAL
      );

      return {
        bestBid: 0,
        bestAsk: 0,
        spread: 0,
        spreadPercent: 0,
        midPrice: 0,
        bidVolume: 0,
        askVolume: 0,
        totalVolume: 0,
        bidPercent: 50,
        askPercent: 50,
      };
    }

    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;

    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    // Рассчитываем объёмы
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
   * Получить размер стакана
   */
  public getSize(): { bids: number; asks: number } {
    return {
      bids: this.bids.size,
      asks: this.asks.size,
    };
  }

  /**
   * Проверить, синхронизирован ли стакан
   */
  public isSynced(): boolean {
    return this.bids.size > 0 && this.asks.size > 0;
  }

  public getUpdateCount(): number {
    return this.updateCount;
  }

  public getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  /**
   * DEBUG: Вывести содержимое стакана
   */
  public debug(): void {
    const bids = this.getBids(5);
    const asks = this.getAsks(5);

    console.log("\n" + "=".repeat(60));
    console.log(`📖 ORDER BOOK DEBUG: ${this.symbol}`);
    console.log("=".repeat(60));
    console.log("\n🟢 TOP 5 BIDS (покупка):");
    bids.forEach((bid, i) => {
      console.log(
        `  ${i + 1}. ${bid.price.toFixed(2)} USDT × ${bid.amount.toFixed(4)}`
      );
    });
    console.log("\n🔴 TOP 5 ASKS (продажа):");
    asks.forEach((ask, i) => {
      console.log(
        `  ${i + 1}. ${ask.price.toFixed(2)} USDT × ${ask.amount.toFixed(4)}`
      );
    });

    const stats = this.getStats();
    console.log("\n📊 СТАТИСТИКА:");
    console.log(`  Best Bid: ${stats.bestBid.toFixed(2)} USDT`);
    console.log(`  Best Ask: ${stats.bestAsk.toFixed(2)} USDT`);
    console.log(
      `  Spread: ${stats.spread.toFixed(2)} USDT (${stats.spreadPercent.toFixed(
        3
      )}%)`
    );
    console.log(
      `  Давление: Bid ${stats.bidPercent.toFixed(
        1
      )}% / Ask ${stats.askPercent.toFixed(1)}%`
    );
    console.log("=".repeat(60) + "\n");
  }
}
