/**
 * @file src/state/stores/MarketStore.ts
 * @version 0
 * @description Хранилище состояния рынка (последняя цена, orderbook stats)
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { eventBus } from "../../core/EventBus";
import { logger } from "../../logger/Logger";
import { LogCategory } from "../../logger/types";
import { Tick, OrderBookStats } from "../../data/types";
import { MarketState, IStateStore } from "../types";

/**
 * Хранилище состояния рынка
 *
 * Обновляется через события:
 * - data:tick:received (последняя цена, объём)
 * - data:orderbook:updated (статистика стакана)
 *
 * @example
 * const marketStore = new MarketStore('ETH_USDT');
 *
 * // Получить текущее состояние
 * const state = marketStore.getCurrentState();
 * console.log(`Цена: ${state.lastPrice}`);
 */
export class MarketStore implements IStateStore {
  private symbol: string;
  private lastPrice: number = 0;
  private volume24h: number = 0;
  private change24h: number = 0;
  private high24h: number = 0;
  private low24h: number = 0;
  private orderBookStats: OrderBookStats | null = null;
  private lastUpdate: number = 0;

  constructor(symbol: string) {
    this.symbol = symbol;
    this.setupEventListeners();
    logger.debug(`MarketStore создан для ${symbol}`, LogCategory.INTERNAL);
  }

  /**
   * Подписка на события
   */
  private setupEventListeners(): void {
    // Обновление от тиков
    eventBus.on("data:tick:received", (tick: Tick) => {
      if (tick.symbol === this.symbol) {
        this.updateFromTick(tick);
      }
    });
  }

  /**
   * Обновить состояние от тика
   *
   * @param tick - данные тика
   */
  private updateFromTick(tick: Tick): void {
    this.lastPrice = tick.price;
    this.volume24h = tick.volume;
    this.change24h = tick.change24h;
    this.high24h = tick.high24h;
    this.low24h = tick.low24h;
    this.lastUpdate = tick.timestamp;

    // Эмитим событие изменения состояния
    eventBus.emitSafe("state:market:changed", this.getCurrentState());
  }

  /**
   * Обновить статистику orderbook
   *
   * @param stats - статистика стакана
   */
  public updateOrderBookStats(stats: OrderBookStats): void {
    this.orderBookStats = stats;
    this.lastUpdate = Date.now();

    // Эмитим событие изменения состояния
    eventBus.emitSafe("state:market:changed", this.getCurrentState());
  }

  /**
   * Получить текущее состояние (для новых клиентов)
   *
   * @returns состояние рынка
   */
  public getCurrentState(): MarketState {
    return {
      symbol: this.symbol,
      lastPrice: this.lastPrice,
      volume24h: this.volume24h,
      change24h: this.change24h,
      high24h: this.high24h,
      low24h: this.low24h,
      orderBookStats: this.orderBookStats,
      lastUpdate: this.lastUpdate,
    };
  }
}
