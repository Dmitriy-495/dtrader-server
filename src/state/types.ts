/**
 * @file src/state/types.ts
 * @version 0
 * @description Типы для State Manager
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import { Balance } from "../exchange/types";
import { Tick, OrderBookStats } from "../data/types";

/**
 * Состояние баланса
 */
export interface BalanceState {
  /** Массив балансов */
  balances: Balance[];

  /** Время последнего обновления */
  lastUpdate: number;
}

/**
 * Состояние позиции
 */
export interface Position {
  /** ID позиции */
  id: string;

  /** Торговая пара */
  symbol: string;

  /** Направление (LONG/SHORT) */
  side: "LONG" | "SHORT";

  /** Цена входа */
  entryPrice: number;

  /** Размер позиции */
  size: number;

  /** Текущая прибыль/убыток */
  pnl: number;

  /** Время открытия */
  openedAt: number;
}

/**
 * Состояние позиций
 */
export interface PositionState {
  /** Массив открытых позиций */
  openPositions: Position[];

  /** Время последнего обновления */
  lastUpdate: number;
}

/**
 * Состояние индикатора
 */
export interface IndicatorValue {
  /** Название индикатора */
  name: string;

  /** Данные индикатора */
  data: any;

  /** Время расчёта */
  timestamp: number;
}

/**
 * Состояние индикаторов
 */
export interface IndicatorState {
  /** Map индикаторов (name → value) */
  indicators: Record<string, IndicatorValue>;

  /** Время последнего обновления */
  lastUpdate: number;
}

/**
 * Состояние рынка
 */
export interface MarketState {
  /** Торговая пара */
  symbol: string;

  /** Последняя цена */
  lastPrice: number;

  /** Объём 24ч */
  volume24h: number;

  /** Изменение 24ч (%) */
  change24h: number;

  /** Максимум 24ч */
  high24h: number;

  /** Минимум 24ч */
  low24h: number;

  /** Статистика orderbook */
  orderBookStats: OrderBookStats | null;

  /** Время последнего обновления */
  lastUpdate: number;
}

/**
 * Полный snapshot состояния системы
 */
export interface SystemSnapshot {
  /** Время создания snapshot */
  timestamp: number;

  /** Состояния всех компонентов */
  states: {
    /** Балансы */
    balance: BalanceState;

    /** Позиции */
    positions: PositionState;

    /** Индикаторы */
    indicators: IndicatorState;

    /** Рынок */
    market: MarketState;
  };
}

/**
 * Интерфейс для любого state store
 */
export interface IStateStore {
  /**
   * Получить текущее состояние для отправки новому клиенту
   */
  getCurrentState(): any;
}
