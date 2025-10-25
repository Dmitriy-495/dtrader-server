/**
 * @file src/state/stores/PositionStore.ts
 * @version 0
 * @description Хранилище открытых позиций в памяти
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { eventBus } from "../../core/EventBus";
import { logger } from "../../logger/Logger";
import { LogCategory } from "../../logger/types";
import { Position, PositionState, IStateStore } from "../types";

/**
 * Хранилище открытых позиций
 *
 * Обновляется через события:
 * - trading:position:opened
 * - trading:position:closed
 * - trading:position:updated
 *
 * @example
 * const positionStore = new PositionStore();
 *
 * // Получить все открытые позиции
 * const positions = positionStore.getAll();
 *
 * // Получить позицию по ID
 * const position = positionStore.get('pos_123');
 */
export class PositionStore implements IStateStore {
  private positions: Map<string, Position> = new Map();
  private lastUpdate: number = 0;

  constructor() {
    this.setupEventListeners();
    logger.debug("PositionStore создан", LogCategory.INTERNAL);
  }

  /**
   * Подписка на события
   */
  private setupEventListeners(): void {
    // Позиция открыта
    eventBus.on("trading:position:opened", (position: Position) => {
      this.add(position);
    });

    // Позиция закрыта
    eventBus.on(
      "trading:position:closed",
      (data: { position: Position; pnl: number }) => {
        this.remove(data.position.id);
      }
    );

    // Позиция обновлена (PnL изменился)
    eventBus.on("trading:position:updated", (position: Position) => {
      this.update(position);
    });
  }

  /**
   * Добавить позицию
   *
   * @param position - данные позиции
   */
  public add(position: Position): void {
    this.positions.set(position.id, position);
    this.lastUpdate = Date.now();

    logger.debug(`Позиция добавлена: ${position.id}`, LogCategory.INTERNAL);

    // Эмитим событие изменения состояния
    eventBus.emitSafe("state:position:changed", this.getAll());
  }

  /**
   * Обновить позицию
   *
   * @param position - обновлённые данные
   */
  public update(position: Position): void {
    if (this.positions.has(position.id)) {
      this.positions.set(position.id, position);
      this.lastUpdate = Date.now();

      logger.debug(`Позиция обновлена: ${position.id}`, LogCategory.INTERNAL);

      // Эмитим событие изменения состояния
      eventBus.emitSafe("state:position:changed", this.getAll());
    }
  }

  /**
   * Удалить позицию (закрыта)
   *
   * @param id - ID позиции
   */
  public remove(id: string): void {
    if (this.positions.delete(id)) {
      this.lastUpdate = Date.now();

      logger.debug(`Позиция удалена: ${id}`, LogCategory.INTERNAL);

      // Эмитим событие изменения состояния
      eventBus.emitSafe("state:position:changed", this.getAll());
    }
  }

  /**
   * Получить позицию по ID
   *
   * @param id - ID позиции
   * @returns позиция или undefined
   */
  public get(id: string): Position | undefined {
    return this.positions.get(id);
  }

  /**
   * Получить все открытые позиции
   *
   * @returns массив позиций
   */
  public getAll(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Получить количество открытых позиций
   *
   * @returns количество
   */
  public getCount(): number {
    return this.positions.size;
  }

  /**
   * Получить текущее состояние (для новых клиентов)
   *
   * @returns состояние позиций
   */
  public getCurrentState(): PositionState {
    return {
      openPositions: this.getAll(),
      lastUpdate: this.lastUpdate,
    };
  }
}
