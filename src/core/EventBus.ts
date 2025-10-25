/**
 * @file src/core/EventBus.ts
 * @version 0
 * @description Централизованная шина событий для разделения критичной и некритичной логики
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { EventEmitter } from "events";
import { EventType, EventHandler } from "./types";
import { config } from "../config/env";

/**
 * Централизованная шина событий
 *
 * Singleton pattern - один экземпляр на всё приложение
 *
 * Назначение:
 * - Разделение критичной (торговой) и некритичной логики
 * - Асинхронная обработка событий
 * - Отвязка компонентов друг от друга
 *
 * Критичная логика (синхронно):
 *   Биржа → Данные → Индикаторы → Стратегия → Ордера
 *
 * Некритичная логика (асинхронно через EventBus):
 *   → Logger (логи)
 *   → WebSocket Server (клиенты)
 *   → Database (сохранение)
 *   → State Manager (snapshot)
 *
 * @example
 * // Подписка на событие
 * eventBus.on('data:tick:received', (tick) => {
 *   console.log('Новый тик:', tick);
 * });
 *
 * // Эмит события
 * eventBus.emit('data:tick:received', { price: 2345.67, volume: 123.45 });
 */
class EventBus extends EventEmitter {
  private static instance: EventBus;

  /**
   * Счётчики для статистики
   */
  private stats = {
    emitted: new Map<string, number>(), // Количество эмитов по типам
    errors: 0, // Количество ошибок
  };

  private constructor() {
    super();

    // Увеличиваем лимит слушателей (по умолчанию 10)
    this.setMaxListeners(config.eventBus.maxListeners);

    // Обработка ошибок в listeners
    this.on("error", (error) => {
      console.error("❌ [EventBus] Необработанная ошибка:", error);
      this.stats.errors++;
    });
  }

  /**
   * Получить единственный экземпляр EventBus (Singleton)
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Эмит события с автоматическим catch ошибок
   *
   * Безопасный эмит - если в одном из listeners произойдёт ошибка,
   * остальные listeners всё равно выполнятся
   *
   * @param event - тип события
   * @param args - аргументы для передачи в listeners
   * @returns true если есть listeners, false если нет
   */
  public emitSafe(event: EventType, ...args: any[]): boolean {
    try {
      // Обновляем статистику
      const count = this.stats.emitted.get(event) || 0;
      this.stats.emitted.set(event, count + 1);

      return this.emit(event, ...args);
    } catch (error) {
      console.error(
        `❌ [EventBus] Ошибка при эмите события "${event}":`,
        error
      );
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Подписка на событие (alias для on с типизацией)
   *
   * @param event - тип события
   * @param handler - обработчик события
   */
  public subscribe(event: EventType, handler: EventHandler): void {
    this.on(event, handler);
  }

  /**
   * Отписка от события (alias для off с типизацией)
   *
   * @param event - тип события
   * @param handler - обработчик события
   */
  public unsubscribe(event: EventType, handler: EventHandler): void {
    this.off(event, handler);
  }

  /**
   * Подписка на событие (одноразовая)
   *
   * @param event - тип события
   * @param handler - обработчик события
   */
  public subscribeOnce(event: EventType, handler: EventHandler): void {
    this.once(event, handler);
  }

  /**
   * Получить количество listeners для события
   *
   * @param event - тип события
   * @returns количество listeners
   */
  public listenerCount(event: EventType): number {
    return super.listenerCount(event);
  }

  /**
   * Получить все зарегистрированные события
   *
   * @returns массив названий событий
   */
  public getEventNames(): EventType[] {
    return super.eventNames() as EventType[];
  }

  /**
   * Получить статистику EventBus
   *
   * @returns объект со статистикой
   */
  public getStats(): {
    emitted: Map<string, number>;
    errors: number;
    totalEvents: number;
    totalEmits: number;
    listeners: { event: string; count: number }[];
  } {
    const totalEmits = Array.from(this.stats.emitted.values()).reduce(
      (a, b) => a + b,
      0
    );

    const listeners = this.getEventNames().map((event) => ({
      event,
      count: this.listenerCount(event),
    }));

    return {
      emitted: this.stats.emitted,
      errors: this.stats.errors,
      totalEvents: this.stats.emitted.size,
      totalEmits,
      listeners,
    };
  }

  /**
   * Очистить статистику
   */
  public clearStats(): void {
    this.stats.emitted.clear();
    this.stats.errors = 0;
  }

  /**
   * Удалить всех listeners для события
   *
   * @param event - тип события (опционально, если не указан - очищает все)
   */
  public removeAllListeners(event?: EventType): this {
    return super.removeAllListeners(event);
  }
}

/**
 * Экспортируем единственный экземпляр EventBus
 */
export const eventBus = EventBus.getInstance();
