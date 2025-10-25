/**
 * @file src/state/stores/IndicatorStore.ts
 * @version 0
 * @description Хранилище последних значений индикаторов
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { eventBus } from "../../core/EventBus";
import { logger } from "../../logger/Logger";
import { LogCategory } from "../../logger/types";
import { IndicatorValue, IndicatorState, IStateStore } from "../types";

/**
 * Хранилище последних значений всех индикаторов
 *
 * Обновляется через события:
 * - indicator:tick_speed:updated
 * - indicator:volume:updated
 * - indicator:pressure:updated
 * - indicator:ema:updated
 * - indicator:rsi:updated
 *
 * @example
 * const indicatorStore = new IndicatorStore();
 *
 * // Получить значение индикатора
 * const tickSpeed = indicatorStore.get('tick_speed');
 *
 * // Получить все индикаторы
 * const all = indicatorStore.getAll();
 */
export class IndicatorStore implements IStateStore {
  private indicators: Map<string, IndicatorValue> = new Map();
  private lastUpdate: number = 0;

  constructor() {
    this.setupEventListeners();
    logger.debug("IndicatorStore создан", LogCategory.INTERNAL);
  }

  /**
   * Подписка на все события индикаторов
   */
  private setupEventListeners(): void {
    // Tick Speed
    eventBus.on("indicator:tick_speed:updated", (data: any) => {
      this.set("tick_speed", data);
    });

    // Volume Confirmation
    eventBus.on("indicator:volume:updated", (data: any) => {
      this.set("volume_confirmation", data);
    });

    // OrderBook Pressure
    eventBus.on("indicator:pressure:updated", (data: any) => {
      this.set("orderbook_pressure", data);
    });

    // EMA
    eventBus.on("indicator:ema:updated", (data: any) => {
      this.set("ema", data);
    });

    // RSI
    eventBus.on("indicator:rsi:updated", (data: any) => {
      this.set("rsi", data);
    });
  }

  /**
   * Установить значение индикатора
   *
   * @param name - название индикатора
   * @param data - данные индикатора
   */
  private set(name: string, data: any): void {
    this.indicators.set(name, {
      name,
      data,
      timestamp: Date.now(),
    });

    this.lastUpdate = Date.now();

    logger.debug(`Индикатор обновлён: ${name}`, LogCategory.INTERNAL);

    // Эмитим событие изменения состояния
    eventBus.emitSafe("state:indicator:changed", {
      name,
      data,
    });
  }

  /**
   * Получить значение индикатора
   *
   * @param name - название индикатора
   * @returns значение или undefined
   */
  public get(name: string): IndicatorValue | undefined {
    return this.indicators.get(name);
  }

  /**
   * Получить все индикаторы
   *
   * @returns массив индикаторов
   */
  public getAll(): IndicatorValue[] {
    return Array.from(this.indicators.values());
  }

  /**
   * Проверить, есть ли индикатор
   *
   * @param name - название индикатора
   * @returns true если есть
   */
  public has(name: string): boolean {
    return this.indicators.has(name);
  }

  /**
   * Получить текущее состояние (для новых клиентов)
   *
   * @returns состояние индикаторов
   */
  public getCurrentState(): IndicatorState {
    const indicators: Record<string, IndicatorValue> = {};

    this.indicators.forEach((indicator, name) => {
      indicators[name] = indicator;
    });

    return {
      indicators,
      lastUpdate: this.lastUpdate,
    };
  }
}
