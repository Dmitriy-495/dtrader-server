/**
 * @file src/exchange/types.ts
 * @version 0
 * @description Типы данных для Gate.io API
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

/**
 * Интерфейс баланса спот-аккаунта
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#list-spot-accounts
 */
export interface Balance {
  /** Валюта (например, USDT, BTC, ETH) */
  currency: string;

  /** Доступный баланс */
  available: string;

  /** Заблокированный баланс (в активных ордерах) */
  locked: string;
}

/**
 * Интерфейс тикера (цена и объём)
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#retrieve-ticker-information
 */
export interface Ticker {
  /** Торговая пара (например, ETH_USDT) */
  currency_pair: string;

  /** Последняя цена */
  last: string;

  /** Цена покупки (лучший bid) */
  highest_bid: string;

  /** Цена продажи (лучший ask) */
  lowest_ask: string;

  /** Изменение цены за 24 часа (процент) */
  change_percentage: string;

  /** Объём торгов за 24 часа (базовая валюта) */
  base_volume: string;

  /** Объём торгов за 24 часа (quote валюта) */
  quote_volume: string;

  /** Максимальная цена за 24 часа */
  high_24h: string;

  /** Минимальная цена за 24 часа */
  low_24h: string;
}

/**
 * Интерфейс уровня orderbook (цена и объём)
 */
export interface OrderBookLevel {
  /** Цена */
  price: string;

  /** Объём */
  amount: string;
}

/**
 * Интерфейс orderbook (стакан ордеров)
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#retrieve-order-book
 */
export interface OrderBook {
  /** ID обновления */
  id: number;

  /** Текущее время (Unix timestamp в секундах) */
  current: number;

  /** Время последнего обновления */
  update: number;

  /** Заявки на покупку (bids) - отсортированы по убыванию цены */
  bids: OrderBookLevel[];

  /** Заявки на продажу (asks) - отсортированы по возрастанию цены */
  asks: OrderBookLevel[];
}

/**
 * Параметры для запроса свечей
 */
export interface CandleParams {
  /** Торговая пара (например, ETH_USDT) */
  currencyPair: string;

  /** Интервал свечи: 10s, 1m, 5m, 15m, 30m, 1h, 4h, 8h, 1d, 7d */
  interval:
    | "10s"
    | "1m"
    | "5m"
    | "15m"
    | "30m"
    | "1h"
    | "4h"
    | "8h"
    | "1d"
    | "7d";

  /** Время начала (Unix timestamp в секундах) - опционально */
  from?: number;

  /** Время окончания (Unix timestamp в секундах) - опционально */
  to?: number;

  /** Количество свечей (максимум 1000) - опционально */
  limit?: number;
}

/**
 * Ответ Gate.io API при ошибке
 */
export interface GateioError {
  /** Код ошибки */
  label: string;

  /** Сообщение об ошибке */
  message: string;
}

/**
 * Конфигурация Gate.io клиента
 */
export interface GateioClientConfig {
  /** API ключ */
  apiKey: string;

  /** API Secret */
  apiSecret: string;

  /** Базовый URL API (по умолчанию: https://api.gateio.ws) */
  apiUrl?: string;

  /** Таймаут запросов в миллисекундах (по умолчанию: 30000) */
  timeout?: number;
}
