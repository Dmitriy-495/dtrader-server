/**
 * @file src/state/stores/BalanceStore.ts
 * @version 0
 * @description Хранилище текущего баланса в памяти
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { eventBus } from "../../core/EventBus";
import { logger } from "../../logger/Logger";
import { LogCategory } from "../../logger/types";
import { Balance } from "../../exchange/types";
import { BalanceState, IStateStore } from "../types";

/**
 * Хранилище текущего баланса
 *
 * Обновляется:
 * 1. При запуске (REST API запрос)
 * 2. При изменении (WebSocket события)
 *
 * @example
 * const balanceStore = new BalanceStore();
 *
 * // Обновить баланс
 * balanceStore.update(balances);
 *
 * // Получить текущий баланс
 * const balance = balanceStore.get('USDT');
 *
 * // Получить все балансы
 * const all = balanceStore.getAll();
 */
export class BalanceStore implements IStateStore {
  private balances: Map<string, Balance> = new Map();
  private lastUpdate: number = 0;

  constructor() {
    this.setupEventListeners();
    logger.debug("BalanceStore создан", LogCategory.INTERNAL);
  }

  /**
   * Подписка на события обновления баланса
   */
  private setupEventListeners(): void {
    // Обновление баланса от REST API или WebSocket
    eventBus.on("data:balance:updated", (balances: Balance[]) => {
      this.update(balances);
    });
  }

  /**
   * Обновить баланс
   *
   * @param balances - массив балансов
   */
  public update(balances: Balance[]): void {
    balances.forEach((balance) => {
      this.balances.set(balance.currency, balance);
    });

    this.lastUpdate = Date.now();

    logger.debug(
      `Баланс обновлён: ${balances.length} валют`,
      LogCategory.INTERNAL
    );

    // Эмитим событие изменения состояния
    eventBus.emitSafe("state:balance:changed", this.getAll());
  }

  /**
   * Получить баланс по валюте
   *
   * @param currency - валюта (например, USDT)
   * @returns баланс или undefined
   */
  public get(currency: string): Balance | undefined {
    return this.balances.get(currency);
  }

  /**
   * Получить все балансы
   *
   * @returns массив всех балансов
   */
  public getAll(): Balance[] {
    return Array.from(this.balances.values());
  }

  /**
   * Получить только ненулевые балансы
   *
   * @returns массив ненулевых балансов
   */
  public getNonZero(): Balance[] {
    return this.getAll().filter(
      (b) => parseFloat(b.available) > 0 || parseFloat(b.locked) > 0
    );
  }

  /**
   * Получить текущее состояние (для новых клиентов)
   *
   * @returns состояние баланса
   */
  public getCurrentState(): BalanceState {
    return {
      balances: this.getAll(),
      lastUpdate: this.lastUpdate,
    };
  }
}
