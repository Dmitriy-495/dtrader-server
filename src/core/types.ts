/**
 * @file src/core/types.ts
 * @version 0
 * @description Типы для ядра системы (Event Bus)
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

/**
 * Типы событий в системе
 *
 * Категории:
 * - exchange:* - события биржи Gate.io
 * - data:* - события данных (тики, orderbook, баланс)
 * - indicator:* - события индикаторов
 * - strategy:* - события стратегии
 * - trading:* - события торговли
 * - client:* - события клиентов
 * - state:* - события изменения state
 * - system:* - системные события
 */
export type EventType =
  // Exchange события
  | "exchange:connected"
  | "exchange:disconnected"
  | "exchange:reconnecting"
  | "exchange:ping:sent"
  | "exchange:pong:received"
  | "exchange:pong:timeout"
  | "exchange:subscribed"
  | "exchange:unsubscribed"
  | "exchange:error"

  // Data события
  | "data:tick:received"
  | "data:orderbook:updated"
  | "data:orderbook:synced"
  | "data:balance:updated"

  // Indicator события
  | "indicator:tick_speed:updated"
  | "indicator:volume:updated"
  | "indicator:pressure:updated"
  | "indicator:ema:updated"
  | "indicator:rsi:updated"

  // Strategy события
  | "strategy:htf:analyzed"
  | "strategy:mtf:signal"
  | "strategy:ltf:entry"
  | "strategy:signal:generated"

  // Trading события
  | "trading:order:created"
  | "trading:order:filled"
  | "trading:order:cancelled"
  | "trading:order:failed"
  | "trading:position:opened"
  | "trading:position:closed"
  | "trading:position:updated"

  // Client события
  | "client:connected"
  | "client:disconnected"
  | "client:subscribed"
  | "client:unsubscribed"
  | "client:send:snapshot"
  | "client:broadcast"

  // State события
  | "state:balance:changed"
  | "state:position:changed"
  | "state:indicator:changed"
  | "state:market:changed"

  // System события
  | "system:startup"
  | "system:shutdown"
  | "system:error"
  | "system:ready";

/**
 * Базовый интерфейс события
 */
export interface BaseEvent {
  type: EventType;
  timestamp: number;
  data?: any;
}

/**
 * Интерфейс обработчика события
 */
export type EventHandler = (...args: any[]) => void | Promise<void>;

/**
 * Интерфейс подписки на событие
 */
export interface EventSubscription {
  event: EventType;
  handler: EventHandler;
  once?: boolean;
}
