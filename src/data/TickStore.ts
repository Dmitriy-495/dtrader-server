/**
 * @file src/data/TickStore.ts
 * @version 0
 * @description Хранилище тиков (circular buffer)
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { eventBus } from "../core/EventBus";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { STORAGE } from "../config/constants";
import { Tick } from "./types";

/**
 * Хранилище тиков в памяти (circular buffer)
 *
 * Особенности:
 * - Хранит последние N тиков (по умолчанию 1000)
 * - Автоматически удаляет старые при переполнении
 * - Быстрый доступ к последним тикам
 * - Расчёт средней цены, объёма и т.д.
 *
 * @example
 * const tickStore = new TickStore('ETH_USDT', 1000);
 *
 * // Добавить тик
 * tickStore.add({
 *   symbol: 'ETH_USDT',
 *   price: 3820.5,
 *   volume: 12345.67,
 *   timestamp: Date.now(),
 * });
 *
 * // Получить последний тик
 * const lastTick = tickStore.getLast();
 *
 * // Получить среднюю цену за последние 100 тиков
 * const avgPrice = tickStore.getAveragePrice(100);
 */
export class TickStore {
  private symbol: string;
  private maxSize: number;
  private ticks: Tick[] = [];
  private tickCount: number = 0;

  /**
   * Конструктор
   *
   * @param symbol - торговая пара
   * @param maxSize - максимальное количество тиков (по умолчанию из констант)
   */
  constructor(symbol: string, maxSize: number = STORAGE.TICK_STORE.MAX_SIZE) {
    this.symbol = symbol;
    this.maxSize = maxSize;

    logger.debug(
      `TickStore создан для ${symbol} (макс. ${maxSize} тиков)`,
      LogCategory.INTERNAL
    );

    // Подписываемся на события тиков
    this.setupEventListeners();
  }

  /**
   * Подписка на события
   */
  private setupEventListeners(): void {
    eventBus.on("data:tick:received", (tick: Tick) => {
      // Проверяем что это наш символ
      if (tick.symbol === this.symbol) {
        this.add(tick);
      }
    });
  }

  /**
   * Добавить тик
   *
   * @param tick - данные тика
   */
  public add(tick: Tick): void {
    // Добавляем в конец
    this.ticks.push(tick);
    this.tickCount++;

    // Если превышен лимит - удаляем самый старый
    if (this.ticks.length > this.maxSize) {
      this.ticks.shift();
    }

    logger.debug(
      `Тик #${this.tickCount} добавлен: ${tick.price} (в буфере: ${this.ticks.length})`,
      LogCategory.INTERNAL
    );
  }

  /**
   * Получить последний тик
   *
   * @returns последний тик или undefined если пусто
   */
  public getLast(): Tick | undefined {
    return this.ticks[this.ticks.length - 1];
  }

  /**
   * Получить N последних тиков
   *
   * @param count - количество тиков
   * @returns массив тиков (от старых к новым)
   */
  public getLastN(count: number): Tick[] {
    if (count >= this.ticks.length) {
      return [...this.ticks];
    }

    return this.ticks.slice(-count);
  }

  /**
   * Получить тики за определённый период времени
   *
   * @param periodMs - период в миллисекундах
   * @returns массив тиков за период
   *
   * @example
   * // Тики за последние 60 секунд
   * const ticks = tickStore.getForPeriod(60000);
   */
  public getForPeriod(periodMs: number): Tick[] {
    const now = Date.now();
    const cutoff = now - periodMs;

    return this.ticks.filter((tick) => tick.timestamp >= cutoff);
  }

  /**
   * Получить все тики
   *
   * @returns массив всех тиков
   */
  public getAll(): Tick[] {
    return [...this.ticks];
  }

  /**
   * Получить количество тиков в буфере
   *
   * @returns количество тиков
   */
  public getCount(): number {
    return this.ticks.length;
  }

  /**
   * Получить общее количество полученных тиков (включая удалённые)
   *
   * @returns общее количество
   */
  public getTotalCount(): number {
    return this.tickCount;
  }

  /**
   * Получить среднюю цену за последние N тиков
   *
   * @param count - количество тиков (по умолчанию все)
   * @returns средняя цена
   */
  public getAveragePrice(count?: number): number {
    const ticks = count ? this.getLastN(count) : this.ticks;

    if (ticks.length === 0) {
      return 0;
    }

    const sum = ticks.reduce((acc, tick) => acc + tick.price, 0);
    return sum / ticks.length;
  }

  /**
   * Получить минимальную цену за последние N тиков
   *
   * @param count - количество тиков (по умолчанию все)
   * @returns минимальная цена
   */
  public getMinPrice(count?: number): number {
    const ticks = count ? this.getLastN(count) : this.ticks;

    if (ticks.length === 0) {
      return 0;
    }

    return Math.min(...ticks.map((t) => t.price));
  }

  /**
   * Получить максимальную цену за последние N тиков
   *
   * @param count - количество тиков (по умолчанию все)
   * @returns максимальная цена
   */
  public getMaxPrice(count?: number): number {
    const ticks = count ? this.getLastN(count) : this.ticks;

    if (ticks.length === 0) {
      return 0;
    }

    return Math.max(...ticks.map((t) => t.price));
  }

  /**
   * Получить средний объём за последние N тиков
   *
   * @param count - количество тиков (по умолчанию все)
   * @returns средний объём
   */
  public getAverageVolume(count?: number): number {
    const ticks = count ? this.getLastN(count) : this.ticks;

    if (ticks.length === 0) {
      return 0;
    }

    const sum = ticks.reduce((acc, tick) => acc + tick.volume, 0);
    return sum / ticks.length;
  }

  /**
   * Проверить, заполнен ли буфер
   *
   * @returns true если буфер заполнен
   */
  public isFull(): boolean {
    return this.ticks.length >= this.maxSize;
  }

  /**
   * Очистить буфер
   */
  public clear(): void {
    this.ticks = [];
    logger.debug(`TickStore очищен для ${this.symbol}`, LogCategory.INTERNAL);
  }

  /**
   * Получить статистику хранилища
   *
   * @returns объект со статистикой
   */
  public getStats(): {
    symbol: string;
    count: number;
    totalCount: number;
    isFull: boolean;
    lastPrice: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    avgVolume: number;
  } {
    const lastTick = this.getLast();

    return {
      symbol: this.symbol,
      count: this.getCount(),
      totalCount: this.getTotalCount(),
      isFull: this.isFull(),
      lastPrice: lastTick?.price || 0,
      avgPrice: this.getAveragePrice(),
      minPrice: this.getMinPrice(),
      maxPrice: this.getMaxPrice(),
      avgVolume: this.getAverageVolume(),
    };
  }
}
